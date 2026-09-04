import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/inquiry_post.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/moderation_service.dart';
import '../../core/theme/app_theme.dart';
import 'inquiry_detail_screen.dart';
import 'inquiry_write_screen.dart';

class InquiryBoardScreen extends StatefulWidget {
  const InquiryBoardScreen({super.key});

  @override
  State<InquiryBoardScreen> createState() => _InquiryBoardScreenState();
}

class _InquiryBoardScreenState extends State<InquiryBoardScreen> {
  final _fs = FirestoreService();
  final _moderationService = ModerationService();
  List<InquiryPost> _posts = [];
  bool _loading = true;
  String _platformFilter = '전체';
  String _categoryFilter = '전체';
  String _statusFilter = '전체';

  static final _platforms = ['전체', '앱', '웹'];
  static final _categories = [
    '전체',
    '기능 개선',
    '버그 신고',
    '사용 문의',
    '경기/기록 오류',
    '기타'
  ];
  static final _statuses = ['전체', '미처리', '처리 중', '처리 완료'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final posts = await _fs.getInquiries();
      if (mounted) {
        setState(() {
          _posts = posts;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  List<InquiryPost> _filtered(Set<String> blockedUserIds) {
    return _posts.where((p) {
      if (blockedUserIds.contains(p.uid)) return false;
      final platformOk = _platformFilter == '전체' ||
          (_platformFilter == '앱' && p.platform == 'app') ||
          (_platformFilter == '웹' && p.platform == 'web');
      final catOk = _categoryFilter == '전체' || p.category == _categoryFilter;
      final statusOk = _statusFilter == '전체' || p.status == _statusFilter;
      return platformOk && catOk && statusOk;
    }).toList();
  }

  bool _isAccessible(InquiryPost post) {
    if (!post.isPrivate) return true;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return false;
    // admin 클레임은 상세 화면에서 처리; 목록에서는 uid만 비교
    return user.uid == post.uid;
  }

  Color _platformColor(String platform) => platform == 'app'
      ? context.aublColors.cobalt
      : context.aublColors.success;

  Color _categoryColor(String cat) => switch (cat) {
        '기능 개선' => context.aublColors.cobalt,
        '버그 신고' => context.aublColors.danger,
        '사용 문의' => context.aublColors.success,
        '경기/기록 오류' => context.aublColors.warning,
        _ => context.aublColors.muted,
      };

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final currentUid = user?.uid;

    return Scaffold(
      appBar: AppBar(
        title: const Text('건의/문의'),
        actions: [
          if (user != null)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: '글쓰기',
              onPressed: () async {
                await Navigator.of(context).push<void>(
                  MaterialPageRoute(builder: (_) => const InquiryWriteScreen()),
                );
                await _load();
              },
            ),
        ],
      ),
      body: StreamBuilder<Set<String>>(
        stream: currentUid == null
            ? Stream.value(<String>{})
            : _moderationService.watchBlockedUserIds(currentUid),
        builder: (context, blockedSnapshot) {
          final blockedUserIds = blockedSnapshot.data ?? <String>{};
          final filtered = _filtered(blockedUserIds);

          return Stack(
            children: [
              _loading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: context.aublColors.cobalt
                                    .withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: context.aublColors.cobalt
                                      .withValues(alpha: 0.35),
                                ),
                              ),
                              child: Text(
                                '첨부파일 업로드는 현재 지원하지 않습니다. 스크린샷 등 파일이 필요한 경우 구글 드라이브 등 외부 링크를 본문에 첨부하거나, 게시글 작성 후 aublcau@gmail.com으로 전송해 주세요.',
                                style: TextStyle(
                                  color: context.aublColors.cobalt,
                                  fontSize: 12,
                                  height: 1.6,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),

                          // ── 필터 행 ──
                          _buildFilterRow(_platforms, _platformFilter,
                              (v) => setState(() => _platformFilter = v)),
                          _buildFilterRow(_categories, _categoryFilter,
                              (v) => setState(() => _categoryFilter = v)),
                          _buildStatusFilterRow(),

                          // ── 게시글 수 ──
                          Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 4),
                            child: Text(
                              '${filtered.length}개 게시글',
                              style: TextStyle(
                                  color: context.aublColors.muted,
                                  fontSize: 12),
                            ),
                          ),

                          // ── 목록 ──
                          if (filtered.isEmpty)
                            Padding(
                              padding: const EdgeInsets.all(32),
                              child: Center(
                                child: Text('게시글이 없습니다.',
                                    style: TextStyle(
                                        color: context.aublColors.muted)),
                              ),
                            )
                          else
                            ...filtered.map((post) {
                              final accessible = _isAccessible(post);
                              final ago = timeago.format(
                                DateTime.fromMillisecondsSinceEpoch(
                                    post.createdAt),
                                locale: 'ko',
                              );
                              return Padding(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 3),
                                child: Material(
                                  color: context.aublColors.surface.withValues(
                                      alpha: accessible ? 0.5 : 0.3),
                                  borderRadius: BorderRadius.circular(10),
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(10),
                                    onTap: accessible
                                        ? () =>
                                            Navigator.of(context).push<void>(
                                              MaterialPageRoute(
                                                builder: (_) =>
                                                    InquiryDetailScreen(
                                                        post: post),
                                              ),
                                            )
                                        : null,
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 14, vertical: 12),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          // 뱃지 행
                                          Row(
                                            children: [
                                              _badge(
                                                post.platform == 'app'
                                                    ? '앱'
                                                    : '웹',
                                                _platformColor(post.platform),
                                              ),
                                              const SizedBox(width: 6),
                                              _badge(
                                                  post.category,
                                                  _categoryColor(
                                                      post.category)),
                                              const SizedBox(width: 6),
                                              _badge(post.status,
                                                  _statusColor(post.status)),
                                              if (post.isPrivate) ...[
                                                const SizedBox(width: 6),
                                                Icon(Icons.lock_outline,
                                                    size: 13,
                                                    color: context
                                                        .aublColors.muted),
                                              ],
                                              const Spacer(),
                                              Text(ago,
                                                  style: TextStyle(
                                                      color: context
                                                          .aublColors.muted,
                                                      fontSize: 11)),
                                            ],
                                          ),
                                          const SizedBox(height: 6),
                                          // 제목
                                          Text(
                                            post.isPrivate && !accessible
                                                ? '🔒 비밀글입니다.'
                                                : post.title,
                                            style: TextStyle(
                                              color: accessible
                                                  ? context.aublColors.ink
                                                  : context.aublColors.muted,
                                              fontSize: 14,
                                              fontWeight: FontWeight.w600,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          if (accessible &&
                                              post.author.isNotEmpty) ...[
                                            const SizedBox(height: 2),
                                            Text(
                                              post.author,
                                              style: TextStyle(
                                                  color:
                                                      context.aublColors.muted,
                                                  fontSize: 12),
                                            ),
                                          ],
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
                    ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildFilterRow(
      List<String> items, String selected, ValueChanged<String> onSelect) {
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: items.map((item) {
          final isSelected = item == selected;
          return Padding(
            padding: const EdgeInsets.only(right: 6),
            child: ChoiceChip(
              label: Text(item,
                  style: TextStyle(
                      color:
                          isSelected ? Colors.white : context.aublColors.muted,
                      fontSize: 12)),
              selected: isSelected,
              selectedColor: context.aublColors.cobalt,
              backgroundColor: context.aublColors.surface,
              side: BorderSide(
                  color: isSelected
                      ? context.aublColors.cobalt
                      : context.aublColors.line),
              onSelected: (_) => onSelect(item),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildStatusFilterRow() {
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: _statuses.map((s) {
          final isSelected = s == _statusFilter;
          final color = _statusColor(s);
          return Padding(
            padding: const EdgeInsets.only(right: 6),
            child: ChoiceChip(
              label: Text(s,
                  style: TextStyle(
                      color: isSelected ? Colors.white : color, fontSize: 12)),
              selected: isSelected,
              selectedColor: color,
              backgroundColor: context.aublColors.surface,
              side: BorderSide(
                  color: isSelected ? color : context.aublColors.line),
              onSelected: (_) => setState(() => _statusFilter = s),
            ),
          );
        }).toList(),
      ),
    );
  }

  Color _statusColor(String status) => switch (status) {
        '미처리' => context.aublColors.danger,
        '처리 중' => context.aublColors.warning,
        '처리 완료' => context.aublColors.success,
        _ => context.aublColors.muted,
      };

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label,
          style: TextStyle(
              color: color, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}
