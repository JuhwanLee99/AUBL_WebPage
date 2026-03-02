import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/player_registration_post.dart';
import '../../core/services/community_access_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/rich_text_viewer.dart';
import 'player_registration_write_screen.dart';

class PlayerRegistrationDetailScreen extends StatefulWidget {
  const PlayerRegistrationDetailScreen({
    super.key,
    required this.post,
    required this.access,
  });

  final PlayerRegistrationPost post;
  final CommunityAccess access;

  @override
  State<PlayerRegistrationDetailScreen> createState() =>
      _PlayerRegistrationDetailScreenState();
}

class _PlayerRegistrationDetailScreenState
    extends State<PlayerRegistrationDetailScreen> {
  final _fs = FirestoreService();
  late PlayerRegistrationPost _post;

  @override
  void initState() {
    super.initState();
    _post = widget.post;
  }

  bool _canWriteCategory(String category) {
    if (category == '선수 등록') return widget.access.canWritePlayerRegistration;
    return widget.access.canWriteUniformRegistration;
  }

  bool get _canEdit {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return false;
    if (widget.access.isAdmin) return true;
    return user.uid == _post.uid && _canWriteCategory(_post.category);
  }

  Color _categoryColor(String category) => switch (category) {
        '선수 등록' => const Color(0xFFF87171),
        '유니폼 등록' => const Color(0xFF34D399),
        _ => AppTheme.slate400,
      };

  Future<void> _deletePost() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.slate800,
        title: const Text('삭제 확인', style: TextStyle(color: Colors.white)),
        content: const Text(
          '게시글을 삭제하시겠습니까?',
          style: TextStyle(color: AppTheme.slate300),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('삭제', style: TextStyle(color: Color(0xFFF87171))),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _fs.deletePlayerRegistrationPost(_post.id);
    if (mounted) Navigator.of(context).pop(true);
  }

  Future<void> _reload() async {
    final fresh = await _fs.getPlayerRegistrationPost(_post.id);
    if (fresh != null && mounted) {
      setState(() => _post = fresh);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('선수 등록 게시판'),
        actions: [
          if (_canEdit) ...[
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              onPressed: () async {
                final updated = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                    builder: (_) => PlayerRegistrationWriteScreen(
                      access: widget.access,
                      editPost: _post,
                    ),
                  ),
                );
                if (updated == true) {
                  await _reload();
                }
              },
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Color(0xFFF87171)),
              onPressed: _deletePost,
            ),
          ],
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _badge(_post.category, _categoryColor(_post.category)),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            _post.title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${_post.author} · ${timeago.format(DateTime.fromMillisecondsSinceEpoch(_post.createdAt), locale: 'ko')}',
            style: const TextStyle(color: AppTheme.slate500, fontSize: 12),
          ),
          const Divider(height: 28),
          RichTextViewer(
            content: _post.content,
            fontSize: 14,
            color: AppTheme.slate300,
            lineHeight: 1.7,
          ),
        ],
      ),
    );
  }

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
