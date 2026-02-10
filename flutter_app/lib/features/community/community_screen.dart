import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/notice.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
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

  @override
  void initState() {
    super.initState();
    _loadNotices();
  }

  Future<void> _loadNotices() async {
    final notices = await _fs.getNotices(limit: 20);
    if (mounted) {
      setState(() {
        _notices = notices;
        _loading = false;
      });
    }
  }

  Color _categoryColor(String cat) => switch (cat) {
        '긴급' => AppTheme.red500,
        '징계' => AppTheme.orange500,
        '경기공지' => AppTheme.blue500,
        _ => AppTheme.slate500,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('커뮤니티')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadNotices,
              child: _notices.isEmpty
                  ? const Center(
                      child: Text('공지가 없습니다.',
                          style: TextStyle(color: AppTheme.slate500)))
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _notices.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (context, i) {
                        final n = _notices[i];
                        final ago = timeago.format(
                          DateTime.fromMillisecondsSinceEpoch(n.createdAt),
                          locale: 'ko',
                        );
                        return ListTile(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          tileColor: AppTheme.slate800,
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
                        );
                      },
                    ),
            ),
    );
  }
}
