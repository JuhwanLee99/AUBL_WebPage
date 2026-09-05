import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/notice.dart';
import '../../app/shell_controller.dart';
import '../../core/services/cache_service.dart';
import '../../core/services/community_access_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/moderation_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/editor/rich_text_editor.dart';
import 'inquiry_board_screen.dart';
import 'notice_detail_screen.dart';
import 'player_registration_board_screen.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});

  @override
  State<CommunityScreen> createState() => CommunityScreenState();
}

class CommunityScreenState extends State<CommunityScreen> {
  final _fs = FirestoreService();
  final _accessService = CommunityAccessService();
  final _moderationService = ModerationService();
  final TextEditingController _searchController = TextEditingController();
  List<Notice> _notices = [];
  bool _loading = true;
  String _selectedCategory = '전체';
  String _searchQuery = '';
  ValueNotifier<int>? _refreshNotifier;
  StreamSubscription<User?>? _authSub;
  bool _isAdmin = false;
  CommunityAccess _communityAccess = const CommunityAccess(
    roleLabel: '방문자',
    isLoggedIn: false,
    isAdmin: false,
    isScorer: false,
    isCoach: false,
    isStaff: false,
    isPlayer: false,
  );

  static const _categories = ['전체', '긴급', '심판/기록원 모집', '경기공지', '징계', '일반'];
  static const _writeCategories = ['일반', '심판/기록원 모집', '징계', '경기공지', '긴급'];

  void _handleRefreshSignal() {
    _loadNotices();
    _checkAdmin();
    _loadCommunityAccess();
  }

  @override
  void initState() {
    super.initState();
    _loadNotices();
    _checkAdmin();
    _loadCommunityAccess();
    _authSub = FirebaseAuth.instance.authStateChanges().listen((_) {
      if (!mounted) return;
      _checkAdmin();
      _loadCommunityAccess();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final notifier = ShellController.of(context)?.refreshNotifier;
    if (notifier != _refreshNotifier) {
      _refreshNotifier?.removeListener(_handleRefreshSignal);
      _refreshNotifier = notifier;
      _refreshNotifier?.addListener(_handleRefreshSignal);
    }
  }

  @override
  void dispose() {
    _refreshNotifier?.removeListener(_handleRefreshSignal);
    _authSub?.cancel();
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
    if (user == null) {
      if (mounted) setState(() => _isAdmin = false);
      return;
    }
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

  Future<void> _loadCommunityAccess() async {
    try {
      final access = await _accessService.resolveCurrentUserAccess();
      if (mounted) setState(() => _communityAccess = access);
    } catch (_) {
      // ignore
    }
  }

  List<Notice> _filteredNotices(Set<String> blockedUserIds) {
    final categoryFiltered = _selectedCategory == '전체'
        ? _notices
        : _notices.where((n) => n.category == _selectedCategory).toList();
    final visible = categoryFiltered
        .where((notice) => !blockedUserIds.contains(notice.uid))
        .toList();

    final q = _searchQuery.trim().toLowerCase();
    if (q.isEmpty) return visible;

    return visible.where((n) {
      final title = n.title.toLowerCase();
      final content = deltaToPreviewText(n.content).toLowerCase();
      final author = n.author.toLowerCase();
      return title.contains(q) || content.contains(q) || author.contains(q);
    }).toList();
  }

  Color _categoryColor(BuildContext context, String cat) => switch (cat) {
    '긴급' => context.aublColors.danger,
    '징계' => context.aublColors.warning,
    '경기공지' => context.aublColors.cobalt,
    _ => context.aublColors.navy,
  };

  Widget _buildAttachmentBadge(
    BuildContext context, {
    required IconData icon,
    required String label,
  }) {
    final colors = context.aublColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: colors.surfaceMuted,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: colors.muted),
          const SizedBox(width: 3),
          Text(
            label,
            style: TextStyle(
              color: colors.muted,
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
    final colors = context.aublColors;
    final currentUid = FirebaseAuth.instance.currentUser?.uid;
    final textScale = MediaQuery.textScalerOf(context).scale(1);

    return Scaffold(
      appBar: AppBar(title: const Text('커뮤니티')),
      floatingActionButton: _isAdmin
          ? FloatingActionButton(
              onPressed: _showWriteNoticeDialog,
              child: const Icon(Icons.edit),
            )
          : null,
      body: StreamBuilder<Set<String>>(
        stream: currentUid == null
            ? Stream.value(<String>{})
            : _moderationService.watchBlockedUserIds(currentUid),
        builder: (context, blockedSnapshot) {
          final blockedUserIds = blockedSnapshot.data ?? const <String>{};
          final filtered = _filteredNotices(blockedUserIds);

          return LayoutBuilder(
            builder: (context, constraints) {
              final outerInset = constraints.maxWidth > 1000
                  ? (constraints.maxWidth - 1000) / 2
                  : 0.0;
              return _loading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _loadNotices,
                      child: ListView(
                        padding: EdgeInsets.symmetric(horizontal: outerInset),
                        children: [
                          // ── 갤러리 배너 ──
                          _buildGalleryBanner(),

                          // ── 건의/문의 배너 ──
                          _buildInquiryBanner(),

                          // ── 선수 등록 게시판 배너 ──
                          _buildPlayerRegistrationBanner(),

                          // ── 카테고리 필터 ──
                          SizedBox(
                            height: textScale >= 1.6 ? 64 : 48,
                            child: ListView(
                              scrollDirection: Axis.horizontal,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              children: _categories.map((cat) {
                                final selected = cat == _selectedCategory;
                                return Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: ChoiceChip(
                                    label: Text(cat),
                                    selected: selected,
                                    onSelected: (_) =>
                                        setState(() => _selectedCategory = cat),
                                  ),
                                );
                              }).toList(),
                            ),
                          ),

                          // ── 검색 ──
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 4,
                            ),
                            child: TextField(
                              controller: _searchController,
                              onChanged: (value) =>
                                  setState(() => _searchQuery = value),
                              textInputAction: TextInputAction.search,
                              decoration: InputDecoration(
                                hintText: '제목, 내용, 작성자 검색',
                                prefixIcon: const Icon(Icons.search, size: 20),
                                suffixIcon: _searchQuery.isEmpty
                                    ? null
                                    : IconButton(
                                        icon: const Icon(Icons.close, size: 18),
                                        onPressed: () {
                                          _searchController.clear();
                                          setState(() => _searchQuery = '');
                                        },
                                      ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                              ),
                            ),
                          ),

                          // ── 공지 수 ──
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 4,
                            ),
                            child: Text(
                              '${filtered.length}개 공지',
                              style: TextStyle(
                                color: colors.muted,
                                fontSize: 12,
                              ),
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
                                  style: TextStyle(color: colors.muted),
                                ),
                              ),
                            )
                          else
                            ...filtered.map((n) {
                              final ago = timeago.format(
                                DateTime.fromMillisecondsSinceEpoch(
                                  n.createdAt,
                                ),
                                locale: 'ko',
                              );
                              final attachment = summarizeDeltaAttachments(
                                n.content,
                              );
                              return Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 3,
                                ),
                                child: Material(
                                  color: colors.surface,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(4),
                                    side: BorderSide(color: colors.line),
                                  ),
                                  clipBehavior: Clip.antiAlias,
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(4),
                                    onTap: () {
                                      Navigator.of(context)
                                          .push(
                                            MaterialPageRoute<void>(
                                              builder: (_) =>
                                                  NoticeDetailScreen(notice: n),
                                            ),
                                          )
                                          .then((_) => _loadNotices());
                                    },
                                    child: Padding(
                                      padding: const EdgeInsets.all(12),
                                      child: Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Wrap(
                                                  spacing: 8,
                                                  runSpacing: 4,
                                                  crossAxisAlignment:
                                                      WrapCrossAlignment.center,
                                                  children: [
                                                    Container(
                                                      padding:
                                                          const EdgeInsets.symmetric(
                                                            horizontal: 6,
                                                            vertical: 2,
                                                          ),
                                                      decoration: BoxDecoration(
                                                        color:
                                                            _categoryColor(
                                                              context,
                                                              n.category,
                                                            ).withValues(
                                                              alpha: 0.1,
                                                            ),
                                                        borderRadius:
                                                            BorderRadius.circular(
                                                              3,
                                                            ),
                                                        border: Border.all(
                                                          color:
                                                              _categoryColor(
                                                                context,
                                                                n.category,
                                                              ).withValues(
                                                                alpha: 0.4,
                                                              ),
                                                        ),
                                                      ),
                                                      child: Text(
                                                        n.category,
                                                        style: TextStyle(
                                                          color: _categoryColor(
                                                            context,
                                                            n.category,
                                                          ),
                                                          fontSize: 11,
                                                          fontWeight:
                                                              FontWeight.w700,
                                                        ),
                                                      ),
                                                    ),
                                                    Text(
                                                      ago,
                                                      style: TextStyle(
                                                        color: colors.muted,
                                                        fontSize: 12,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                                const SizedBox(height: 7),
                                                Text(
                                                  n.title,
                                                  style: const TextStyle(
                                                    fontSize: 14,
                                                    fontWeight: FontWeight.w700,
                                                  ),
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                                const SizedBox(height: 4),
                                                Text(
                                                  n.author,
                                                  style: TextStyle(
                                                    color: colors.muted,
                                                    fontSize: 12,
                                                  ),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                                if (attachment.hasAny) ...[
                                                  const SizedBox(height: 6),
                                                  Wrap(
                                                    spacing: 6,
                                                    runSpacing: 4,
                                                    children: [
                                                      if (attachment.hasImage)
                                                        _buildAttachmentBadge(
                                                          context,
                                                          icon: Icons
                                                              .image_outlined,
                                                          label: '이미지',
                                                        ),
                                                      if (attachment.hasVideo)
                                                        _buildAttachmentBadge(
                                                          context,
                                                          icon: Icons
                                                              .videocam_outlined,
                                                          label: '동영상',
                                                        ),
                                                      if (attachment.hasLink)
                                                        _buildAttachmentBadge(
                                                          context,
                                                          icon: Icons.link,
                                                          label: '링크',
                                                        ),
                                                    ],
                                                  ),
                                                ],
                                              ],
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              top: 2,
                                            ),
                                            child: Icon(
                                              Icons.arrow_forward_rounded,
                                              size: 18,
                                              color: colors.muted,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }),
                          const SizedBox(height: 32),
                        ],
                      ),
                    );
            },
          );
        },
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
          insetPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 24,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('공지 작성', style: Theme.of(ctx).textTheme.titleLarge),
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
                Text(
                  '이미지/동영상은 툴바 버튼으로 URL을 입력하여 삽입할 수 있습니다.',
                  style: TextStyle(color: ctx.aublColors.muted, fontSize: 11),
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
                      onPressed: saving
                          ? null
                          : () async {
                              final title = titleCtrl.text.trim();
                              if (title.isEmpty || isDeltaEmpty(contentDelta)) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('제목과 내용을 입력해주세요.'),
                                  ),
                                );
                                return;
                              }
                              setDialogState(() => saving = true);
                              try {
                                final currentUser =
                                    FirebaseAuth.instance.currentUser;
                                if (currentUser == null) {
                                  if (!mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('로그인이 필요합니다.'),
                                    ),
                                  );
                                  return;
                                }
                                final author =
                                    currentUser.displayName ??
                                    currentUser.email?.split('@').first ??
                                    '관리자';
                                await _fs.addNotice(
                                  title: title,
                                  category: category,
                                  content: contentDelta,
                                  uid: currentUser.uid,
                                  author: author,
                                  isImportant: isImportant,
                                );
                                if (ctx.mounted) Navigator.pop(ctx);
                                if (mounted) {
                                  _loadNotices();
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('공지가 등록되었습니다.'),
                                    ),
                                  );
                                }
                              } catch (e) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('오류가 발생했습니다: $e')),
                                  );
                                }
                              } finally {
                                if (ctx.mounted) {
                                  setDialogState(() => saving = false);
                                }
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
    return _CommunityLinkCard(
      icon: Icons.chat_bubble_outline_rounded,
      title: '건의/문의 게시판',
      description: '오류 신고와 이용 문의',
      onTap: () {
        Navigator.of(context).push<void>(
          MaterialPageRoute(builder: (_) => const InquiryBoardScreen()),
        );
      },
    );
  }

  Widget _buildPlayerRegistrationBanner() {
    final canAccess = _communityAccess.isPlayerOrAbove;
    return _CommunityLinkCard(
      icon: canAccess ? Icons.badge_outlined : Icons.lock_outline,
      title: '선수 등록 게시판',
      description: canAccess ? '선수·유니폼 등록 관리' : '선수·기록원 이상 이용 가능',
      locked: !canAccess,
      onTap: () async {
        final messenger = ScaffoldMessenger.of(context);
        final navigator = Navigator.of(context);
        final latestAccess = await _accessService.resolveCurrentUserAccess();
        if (mounted) {
          setState(() => _communityAccess = latestAccess);
        }
        if (!latestAccess.isPlayerOrAbove) {
          messenger.showSnackBar(
            const SnackBar(content: Text('선수/기록원 등급 이상 계정만 접근할 수 있습니다.')),
          );
          return;
        }
        await navigator.push<void>(
          MaterialPageRoute(
            builder: (_) => const PlayerRegistrationBoardScreen(),
          ),
        );
      },
    );
  }

  Widget _buildGalleryBanner() {
    return _CommunityLinkCard(
      icon: Icons.photo_library_outlined,
      title: 'AUBL 갤러리',
      description: '사진과 소식 보기',
      external: true,
      onTap: () async {
        final uri = Uri.parse('https://m.dcinside.com/board/aubl');
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      },
    );
  }
}

class _CommunityLinkCard extends StatelessWidget {
  const _CommunityLinkCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
    this.locked = false,
    this.external = false,
  });

  final IconData icon;
  final String title;
  final String description;
  final VoidCallback onTap;
  final bool locked;
  final bool external;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
      child: Material(
        color: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
          side: BorderSide(color: colors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          borderRadius: BorderRadius.circular(4),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: colors.surfaceMuted,
                    border: Border.all(color: colors.line),
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Icon(
                    icon,
                    color: locked ? colors.danger : colors.cobalt,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: colors.muted,
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  locked
                      ? Icons.lock_outline
                      : external
                      ? Icons.open_in_new
                      : Icons.arrow_forward_rounded,
                  size: 18,
                  color: colors.muted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
