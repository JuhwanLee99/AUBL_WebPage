import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/player_registration_post.dart';
import '../../core/services/community_access_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/moderation_service.dart';
import '../../core/theme/app_theme.dart';
import 'player_registration_detail_screen.dart';
import 'player_registration_write_screen.dart';

class PlayerRegistrationBoardScreen extends StatefulWidget {
  const PlayerRegistrationBoardScreen({super.key});

  @override
  State<PlayerRegistrationBoardScreen> createState() =>
      _PlayerRegistrationBoardScreenState();
}

class _PlayerRegistrationBoardScreenState
    extends State<PlayerRegistrationBoardScreen> {
  final _fs = FirestoreService();
  final _accessService = CommunityAccessService();
  final _moderationService = ModerationService();
  List<PlayerRegistrationPost> _posts = [];
  bool _loading = true;
  String _categoryFilter = '전체';
  String _searchQuery = '';
  StreamSubscription<User?>? _authSub;
  CommunityAccess _access = const CommunityAccess(
    roleLabel: '방문자',
    isLoggedIn: false,
    isAdmin: false,
    isScorer: false,
    isCoach: false,
    isStaff: false,
    isPlayer: false,
  );

  static final _categories = ['전체', '선수 등록', '유니폼 등록'];

  @override
  void initState() {
    super.initState();
    _load();
    _authSub = FirebaseAuth.instance.authStateChanges().listen((_) {
      if (!mounted) return;
      _load();
    });
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final access = await _accessService.resolveCurrentUserAccess();
      if (!access.isPlayerOrAbove) {
        if (!mounted) return;
        setState(() {
          _access = access;
          _posts = [];
          _loading = false;
        });
        return;
      }

      final posts = await _fs.getPlayerRegistrationPosts();
      if (mounted) {
        setState(() {
          _access = access;
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

  List<PlayerRegistrationPost> _filtered(Set<String> blockedUserIds) {
    final categoryFiltered = _categoryFilter == '전체'
        ? _posts
        : _posts.where((p) => p.category == _categoryFilter).toList();
    final visible = categoryFiltered
        .where((post) => !blockedUserIds.contains(post.uid))
        .toList();
    final q = _searchQuery.trim().toLowerCase();
    if (q.isEmpty) return visible;
    return visible
        .where((p) => '${p.title} ${p.author}'.toLowerCase().contains(q))
        .toList();
  }

  Color _categoryColor(String category) => switch (category) {
        '선수 등록' => context.aublColors.danger,
        '유니폼 등록' => context.aublColors.success,
        _ => context.aublColors.muted,
      };

  @override
  Widget build(BuildContext context) {
    final canWriteAny = _access.canWritePlayerRegistration ||
        _access.canWriteUniformRegistration;
    final currentUid = FirebaseAuth.instance.currentUser?.uid;

    return Scaffold(
      appBar: AppBar(
        title: const Text('선수 등록 게시판'),
        actions: [
          if (canWriteAny)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: '글쓰기',
              onPressed: () async {
                await Navigator.of(context).push<void>(
                  MaterialPageRoute(
                    builder: (_) => PlayerRegistrationWriteScreen(
                      access: _access,
                    ),
                  ),
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
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (!_access.isPlayerOrAbove)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color:
                            context.aublColors.danger.withValues(alpha: 0.35),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: context.aublColors.danger
                                .withValues(alpha: 0.4)),
                      ),
                      child: Text(
                        '선수 등록 게시판은 선수/기록원 등급 이상만 접근할 수 있습니다.',
                        style: TextStyle(
                          color: context.aublColors.danger,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          height: 1.6,
                        ),
                      ),
                    ),
                  ),
                )
              else
                RefreshIndicator(
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
                            '열람: 선수/기록원 등급 이상\n작성: 선수 등록(관리자), 유니폼 등록(감독/관리자)',
                            style: TextStyle(
                              color: context.aublColors.cobalt,
                              fontSize: 12,
                              height: 1.6,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                      SizedBox(
                        height: 44,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          children: _categories.map((category) {
                            final selected = category == _categoryFilter;
                            final color = category == '전체'
                                ? context.aublColors.cobalt
                                : _categoryColor(category);
                            return Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: ChoiceChip(
                                label: Text(
                                  category,
                                  style: TextStyle(
                                    color: selected ? Colors.white : color,
                                    fontSize: 12,
                                  ),
                                ),
                                selected: selected,
                                selectedColor: color,
                                backgroundColor: context.aublColors.surface,
                                side: BorderSide(
                                    color: selected
                                        ? color
                                        : context.aublColors.line),
                                onSelected: (_) =>
                                    setState(() => _categoryFilter = category),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 4),
                        child: TextField(
                          onChanged: (value) =>
                              setState(() => _searchQuery = value),
                          textInputAction: TextInputAction.search,
                          style: TextStyle(
                              color: context.aublColors.ink, fontSize: 14),
                          decoration: InputDecoration(
                            hintText: '제목, 작성자 검색',
                            hintStyle: TextStyle(
                                color: context.aublColors.muted, fontSize: 13),
                            prefixIcon: Icon(Icons.search,
                                color: context.aublColors.muted, size: 20),
                            filled: true,
                            fillColor: context.aublColors.surface
                                .withValues(alpha: 0.5),
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide:
                                  BorderSide(color: context.aublColors.line),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide:
                                  BorderSide(color: context.aublColors.line),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide:
                                  BorderSide(color: context.aublColors.cobalt),
                            ),
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 4),
                        child: Text(
                          '${filtered.length}개 게시글',
                          style: TextStyle(
                              color: context.aublColors.muted, fontSize: 12),
                        ),
                      ),
                      if (filtered.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(32),
                          child: Center(
                            child: Text(
                              '게시글이 없습니다.',
                              style: TextStyle(color: context.aublColors.muted),
                            ),
                          ),
                        )
                      else
                        ...filtered.map((post) {
                          final ago = timeago.format(
                            DateTime.fromMillisecondsSinceEpoch(post.createdAt),
                            locale: 'ko',
                          );
                          return Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 3),
                            child: Material(
                              color: context.aublColors.surface
                                  .withValues(alpha: 0.5),
                              borderRadius: BorderRadius.circular(10),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(10),
                                onTap: () => Navigator.of(context).push<void>(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        PlayerRegistrationDetailScreen(
                                      post: post,
                                      access: _access,
                                    ),
                                  ),
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 14, vertical: 12),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          _badge(post.category,
                                              _categoryColor(post.category)),
                                          const Spacer(),
                                          Text(
                                            ago,
                                            style: TextStyle(
                                                color: context.aublColors.muted,
                                                fontSize: 11),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        post.title,
                                        style: TextStyle(
                                          color: context.aublColors.ink,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      if (post.author.isNotEmpty) ...[
                                        const SizedBox(height: 2),
                                        Text(
                                          post.author,
                                          style: TextStyle(
                                            color: context.aublColors.muted,
                                            fontSize: 12,
                                          ),
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

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
