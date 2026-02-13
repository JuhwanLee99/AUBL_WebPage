import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/notice.dart';
import '../../app/shell_controller.dart';
import '../../core/services/cache_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/background_logo.dart';
import 'notice_detail_screen.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});

  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  final _fs = FirestoreService();
  List<Notice> _notices = [];
  bool _loading = true;
  String _selectedCategory = '전체';
  ValueNotifier<int>? _refreshNotifier;

  static const _categories = ['전체', '긴급', '경기공지', '징계', '일반'];

  @override
  void initState() {
    super.initState();
    _loadNotices();
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
    super.dispose();
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
    if (_selectedCategory == '전체') return _notices;
    return _notices.where((n) => n.category == _selectedCategory).toList();
  }

  Color _categoryColor(String cat) => switch (cat) {
        '긴급' => AppTheme.red500,
        '징계' => AppTheme.orange500,
        '경기공지' => AppTheme.blue500,
        _ => AppTheme.slate500,
      };

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredNotices;

    return Scaffold(
      appBar: AppBar(title: const Text('커뮤니티')),
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
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(
                        child: Text('공지가 없습니다.',
                            style: TextStyle(color: AppTheme.slate500)),
                      ),
                    )
                  else
                    ...filtered.map((n) {
                      final ago = timeago.format(
                        DateTime.fromMillisecondsSinceEpoch(n.createdAt),
                        locale: 'ko',
                      );
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
                          subtitle: Text(
                            '${n.author} · $ago',
                            style: const TextStyle(
                                color: AppTheme.slate500, fontSize: 12),
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
