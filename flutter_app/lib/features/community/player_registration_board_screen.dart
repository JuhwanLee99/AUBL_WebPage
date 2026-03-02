import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/player_registration_post.dart';
import '../../core/services/community_access_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/background_logo.dart';
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
  List<PlayerRegistrationPost> _posts = [];
  bool _loading = true;
  String _categoryFilter = '전체';
  String _searchQuery = '';
  CommunityAccess _access = const CommunityAccess(
    roleLabel: '방문자',
    isLoggedIn: false,
    isAdmin: false,
    isScorer: false,
    isCoach: false,
    isStaff: false,
    isPlayer: false,
  );

  static const _categories = ['전체', '선수 등록', '유니폼 등록'];

  @override
  void initState() {
    super.initState();
    _load();
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

  List<PlayerRegistrationPost> get _filtered {
    final categoryFiltered = _categoryFilter == '전체'
        ? _posts
        : _posts.where((p) => p.category == _categoryFilter).toList();
    final q = _searchQuery.trim().toLowerCase();
    if (q.isEmpty) return categoryFiltered;
    return categoryFiltered
        .where((p) => '${p.title} ${p.author}'.toLowerCase().contains(q))
        .toList();
  }

  Color _categoryColor(String category) => switch (category) {
        '선수 등록' => const Color(0xFFF87171),
        '유니폼 등록' => const Color(0xFF34D399),
        _ => AppTheme.slate400,
      };

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final canWriteAny = _access.canWritePlayerRegistration ||
        _access.canWriteUniformRegistration;

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
      body: Stack(
        children: [
          const BackgroundLogo(saturation: 0.85),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (!_access.isPlayerOrAbove)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF7F1D1D).withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: const Color(0xFFF87171).withValues(alpha: 0.4)),
                  ),
                  child: const Text(
                    '선수 등록 게시판은 선수/기록원 등급 이상만 접근할 수 있습니다.',
                    style: TextStyle(
                      color: Color(0xFFFECACA),
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
                        color: AppTheme.blue500.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: AppTheme.blue500.withValues(alpha: 0.35),
                        ),
                      ),
                      child: const Text(
                        '열람: 선수/기록원 등급 이상\n작성: 선수 등록(관리자), 유니폼 등록(감독/관리자)',
                        style: TextStyle(
                          color: AppTheme.blue400,
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
                            ? AppTheme.blue400
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
                            backgroundColor: AppTheme.slate800,
                            side: BorderSide(
                                color: selected ? color : AppTheme.slate700),
                            onSelected: (_) =>
                                setState(() => _categoryFilter = category),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    child: TextField(
                      onChanged: (value) =>
                          setState(() => _searchQuery = value),
                      textInputAction: TextInputAction.search,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: InputDecoration(
                        hintText: '제목, 작성자 검색',
                        hintStyle: const TextStyle(
                            color: AppTheme.slate500, fontSize: 13),
                        prefixIcon: const Icon(Icons.search,
                            color: AppTheme.slate500, size: 20),
                        filled: true,
                        fillColor: AppTheme.slate800.withValues(alpha: 0.5),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              const BorderSide(color: AppTheme.slate700),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              const BorderSide(color: AppTheme.slate700),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: AppTheme.blue500),
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Text(
                      '${filtered.length}개 게시글',
                      style: const TextStyle(
                          color: AppTheme.slate500, fontSize: 12),
                    ),
                  ),
                  if (filtered.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(
                        child: Text(
                          '게시글이 없습니다.',
                          style: TextStyle(color: AppTheme.slate500),
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
                          color: AppTheme.slate800.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(10),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(10),
                            onTap: () => Navigator.of(context).push<void>(
                              MaterialPageRoute(
                                builder: (_) => PlayerRegistrationDetailScreen(
                                  post: post,
                                  access: _access,
                                ),
                              ),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      _badge(post.category,
                                          _categoryColor(post.category)),
                                      const Spacer(),
                                      Text(
                                        ago,
                                        style: const TextStyle(
                                            color: AppTheme.slate500,
                                            fontSize: 11),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    post.title,
                                    style: const TextStyle(
                                      color: Colors.white,
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
                                      style: const TextStyle(
                                        color: AppTheme.slate500,
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
