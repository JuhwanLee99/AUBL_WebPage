import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/notice.dart';
import '../../app/shell_controller.dart';
import '../../core/services/cache_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/background_logo.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/editor/rich_text_editor.dart';
import 'inquiry_board_screen.dart';
import 'notice_detail_screen.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});

  @override
  State<CommunityScreen> createState() => CommunityScreenState();
}

class CommunityScreenState extends State<CommunityScreen> {
  final _fs = FirestoreService();
  final TextEditingController _searchController = TextEditingController();
  List<Notice> _notices = [];
  bool _loading = true;
  String _selectedCategory = '전체';
  String _searchQuery = '';
  ValueNotifier<int>? _refreshNotifier;
  bool _isAdmin = false;

  static const _categories = ['전체', '긴급', '경기공지', '징계', '일반'];
  static const _writeCategories = ['일반', '징계', '경기공지', '긴급'];

  @override
  void initState() {
    super.initState();
    _loadNotices();
    _checkAdmin();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final notifier = ShellController.of(context)?.refreshNotifier;
    if (notifier != _refreshNotifier) {
      _refreshNotifier?.removeListener(_loadNotices);
      _refreshNotifier = notifier;
      _refreshNotifier?.addListener(_loadNotices);
    }
  }

  @override
  void dispose() {
    _refreshNotifier?.removeListener(_loadNotices);
    _searchController.dispose();
    super.dispose();
  }

  /// 알림 탭 등 외부에서 카테고리 필터를 지정할 때 호출.
  void switchToCategory(String category) {
    if (!mounted) return;
    setState(() => _selectedCategory = category);
  }

  Future<void> _checkAdmin() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final token = await user.getIdTokenResult();
    if (mounted) setState(() => _isAdmin = token.claims?['admin'] == true);
  }

  Future<void> _loadNotices() async {
    // 캐시에서 즉시 로드
    final cached = await CacheService.instance.getCachedNotices();
    if (cached != null && _loading) {
      if (mounted) {
        setState(() {
          _notices = cached;
          _loading = false;
        });
      }
    }

    // 네트워크에서 최신 데이터
    try {
      final notices = await _fs.getNotices(limit: 30);
      if (mounted) {
        setState(() {
          _notices = notices;
          _loading = false;
        });
      }
      CacheService.instance.cacheNotices(notices);
    } catch (_) {
      if (mounted && _loading) setState(() => _loading = false);
    }
  }

  List<Notice> get _filteredNotices {
    final categoryFiltered = _selectedCategory == '전체'
        ? _notices
        : _notices.where((n) => n.category == _selectedCategory).toList();

    final q = _searchQuery.trim().toLowerCase();
    if (q.isEmpty) return categoryFiltered;

    return categoryFiltered.where((n) {
      final title = n.title.toLowerCase();
      final content = deltaToPreviewText(n.content).toLowerCase();
      final author = n.author.toLowerCase();
      return title.contains(q) || content.contains(q) || author.contains(q);
    }).toList();
  }

  Color _categoryColor(String cat) => switch (cat) {
        '긴급' => AppTheme.red500,
        '징계' => AppTheme.orange500,
        '경기공지' => AppTheme.blue500,
        _ => AppTheme.slate500,
      };

  Widget _buildAttachmentBadge({
    required IconData icon,
    required String label,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.slate700.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppTheme.slate400),
          const SizedBox(width: 3),
          Text(
            label,
            style: const TextStyle(
              color: AppTheme.slate400,
              fontSize: 10,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredNotices;

    return Scaffold(
      appBar: AppBar(title: const Text('커뮤니티')),
      floatingActionButton: _isAdmin
          ? FloatingActionButton(
              onPressed: _showWriteNoticeDialog,
              child: const Icon(Icons.edit),
            )
          : null,
      body: Stack(
        children: [
          const BackgroundLogo(saturation: 0.85),
          _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadNotices,
              child: ListView(
                children: [
                  // ── 갤러리 배너 ──
                  _buildGalleryBanner(),
                  const Divider(height: 1),

                  // ── 건의/문의 배너 ──
                  _buildInquiryBanner(),
                  const Divider(height: 1),

                  // ── 카테고리 필터 ──
                  SizedBox(
                    height: 48,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      children: _categories.map((cat) {
                        final selected = cat == _selectedCategory;
                        final color =
                            cat == '전체' ? AppTheme.blue400 : _categoryColor(cat);
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(cat,
                                style: TextStyle(
                                    color: selected ? Colors.white : color,
                                    fontSize: 13)),
                            selected: selected,
                            selectedColor: color,
                            onSelected: (_) =>
                                setState(() => _selectedCategory = cat),
                          ),
                        );
                      }).toList(),
                    ),
                  ),

                  // ── 검색 ──
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    child: TextField(
                      controller: _searchController,
                      onChanged: (value) =>
                          setState(() => _searchQuery = value),
                      textInputAction: TextInputAction.search,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: InputDecoration(
                        hintText: '제목, 내용, 작성자 검색',
                        hintStyle: const TextStyle(
                            color: AppTheme.slate500, fontSize: 13),
                        prefixIcon: const Icon(Icons.search,
                            color: AppTheme.slate500, size: 20),
                        suffixIcon: _searchQuery.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.close,
                                    color: AppTheme.slate500, size: 18),
                                onPressed: () {
                                  _searchController.clear();
                                  setState(() => _searchQuery = '');
                                },
                              ),
                        filled: true,
                        fillColor: AppTheme.slate800.withValues(alpha: 0.5),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              BorderSide(color: AppTheme.slate700.withValues(alpha: 0.6)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              BorderSide(color: AppTheme.slate700.withValues(alpha: 0.6)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              BorderSide(color: AppTheme.blue500.withValues(alpha: 0.9)),
                        ),
                      ),
                    ),
                  ),

                  // ── 공지 수 ──
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Text(
                      '${filtered.length}개 공지',
                      style: const TextStyle(
                          color: AppTheme.slate500, fontSize: 12),
                    ),
                  ),

                  // ── 공지 목록 ──
                  if (filtered.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(32),
                      child: Center(
                        child: Text(
                          _searchQuery.trim().isEmpty
                              ? '공지가 없습니다.'
                              : '검색 결과가 없습니다.',
                          style: const TextStyle(color: AppTheme.slate500),
                        ),
                      ),
                    )
                  else
                    ...filtered.map((n) {
                      final ago = timeago.format(
                        DateTime.fromMillisecondsSinceEpoch(n.createdAt),
                        locale: 'ko',
                      );
                      final attachment = summarizeDeltaAttachments(n.content);
                      return Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 3),
                        child: ListTile(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          tileColor: AppTheme.slate800.withValues(alpha: 0.5),
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) =>
                                    NoticeDetailScreen(notice: n),
                              ),
                            );
                          },
                          leading: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: _categoryColor(n.category)
                                  .withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              n.category,
                              style: TextStyle(
                                color: _categoryColor(n.category),
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          title: Text(
                            n.title,
                            style: const TextStyle(
                                color: Colors.white, fontSize: 14),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '${n.author} · $ago',
                                style: const TextStyle(
                                    color: AppTheme.slate500, fontSize: 12),
                              ),
                              if (attachment.hasAny) ...[
                                const SizedBox(height: 4),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: [
                                    if (attachment.hasImage)
                                      _buildAttachmentBadge(
                                        icon: Icons.image_outlined,
                                        label: '이미지',
                                      ),
                                    if (attachment.hasVideo)
                                      _buildAttachmentBadge(
                                        icon: Icons.videocam_outlined,
                                        label: '동영상',
                                      ),
                                    if (attachment.hasLink)
                                      _buildAttachmentBadge(
                                        icon: Icons.link,
                                        label: '링크',
                                      ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                          trailing: const Icon(Icons.chevron_right,
                              size: 18, color: AppTheme.slate500),
                        ),
                      );
                    }),
                  const SizedBox(height: 32),
                ],
              ),
            ),
        ],
      ),
    );
  }

  void _showWriteNoticeDialog() {
    final titleCtrl = TextEditingController();
    String contentDelta = '';
    String category = '일반';
    bool isImportant = false;
    bool saving = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => Dialog(
          backgroundColor: AppTheme.slate800,
          insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '공지 작성',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: category,
                  items: _writeCategories
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setDialogState(() => category = v);
                  },
                  decoration: const InputDecoration(labelText: '카테고리'),
                  dropdownColor: AppTheme.slate700,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: '제목'),
                ),
                const SizedBox(height: 12),
                RichTextEditor(
                  onChanged: (v) => contentDelta = v,
                  placeholder: '내용을 입력하세요',
                  minHeight: 160,
                ),
                const SizedBox(height: 6),
                const Text(
                  '이미지/동영상은 툴바 버튼으로 URL을 입력하여 삽입할 수 있습니다.',
                  style: TextStyle(color: AppTheme.slate500, fontSize: 11),
                ),
                const SizedBox(height: 4),
                CheckboxListTile(
                  value: isImportant,
                  onChanged: (v) =>
                      setDialogState(() => isImportant = v ?? false),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('중요 공지로 표시'),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: saving ? null : () => Navigator.pop(ctx),
                      child: const Text('취소'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        disabledBackgroundColor: AppTheme.slate700,
                      ),
                      onPressed: saving
                          ? null
                          : () async {
                              final title = titleCtrl.text.trim();
                              if (title.isEmpty || isDeltaEmpty(contentDelta)) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content: Text('제목과 내용을 입력해주세요.')),
                                );
                                return;
                              }
                              setDialogState(() => saving = true);
                              try {
                                final author =
                                    FirebaseAuth.instance.currentUser?.displayName ??
                                        '관리자';
                                await _fs.addNotice(
                                  title: title,
                                  category: category,
                                  content: contentDelta,
                                  author: author,
                                  isImportant: isImportant,
                                );
                                if (ctx.mounted) Navigator.pop(ctx);
                                if (mounted) {
                                  _loadNotices();
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('공지가 등록되었습니다.')),
                                  );
                                }
                              } catch (e) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('오류가 발생했습니다: $e')),
                                  );
                                }
                              } finally {
                                if (ctx.mounted) setDialogState(() => saving = false);
                              }
                            },
                      child: Text(saving ? '게시 중...' : '게시'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInquiryBanner() {
    return GestureDetector(
      onTap: () {
        Navigator.of(context).push<void>(
          MaterialPageRoute(builder: (_) => const InquiryBoardScreen()),
        );
      },
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.indigo500.withValues(alpha: 0.15),
              AppTheme.slate800.withValues(alpha: 0.5),
            ],
          ),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.slate700),
        ),
        child: const Row(
          children: [
            Icon(Icons.chat_bubble_outline, color: Color(0xFF818CF8), size: 28),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('건의/문의 게시판',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600)),
                  SizedBox(height: 2),
                  Text('기능 개선, 버그 신고, 사용 문의를 남겨주세요',
                      style: TextStyle(color: AppTheme.slate400, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppTheme.slate500, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildGalleryBanner() {
    return GestureDetector(
      onTap: () async {
        final uri =
            Uri.parse('https://gall.dcinside.com/mini/board/lists/?id=aubl');
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      },
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.blue500.withValues(alpha: 0.15),
              AppTheme.slate800.withValues(alpha: 0.5),
            ],
          ),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.slate700),
        ),
        child: const Row(
          children: [
            Icon(Icons.photo_library, color: AppTheme.blue400, size: 28),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('AUBL 갤러리',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600)),
                  SizedBox(height: 2),
                  Text('DC인사이드 갤러리로 이동',
                      style:
                          TextStyle(color: AppTheme.slate400, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.open_in_new, color: AppTheme.slate500, size: 18),
          ],
        ),
      ),
    );
  }
}
