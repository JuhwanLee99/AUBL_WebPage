import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/notice.dart';
import '../../core/models/notice_comment.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';

class NoticeDetailScreen extends StatefulWidget {
  const NoticeDetailScreen({super.key, required this.notice});

  final Notice notice;

  @override
  State<NoticeDetailScreen> createState() => _NoticeDetailScreenState();
}

class _NoticeDetailScreenState extends State<NoticeDetailScreen> {
  final _fs = FirestoreService();
  final _commentCtrl = TextEditingController();

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _postComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    await _fs.addNoticeComment(
      widget.notice.id,
      NoticeComment(
        id: '',
        uid: user.uid,
        author: user.email?.split('@').first ?? '익명',
        content: text,
        createdAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
    _commentCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.notice;

    return Scaffold(
      appBar: AppBar(title: const Text('공지 상세')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(n.title,
                    style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white)),
                const SizedBox(height: 8),
                Text(
                  '${n.author} · ${timeago.format(DateTime.fromMillisecondsSinceEpoch(n.createdAt), locale: 'ko')}',
                  style: const TextStyle(
                      color: AppTheme.slate500, fontSize: 13),
                ),
                const Divider(height: 24),
                Text(n.content,
                    style: const TextStyle(
                        color: AppTheme.slate300, fontSize: 14)),
                const SizedBox(height: 24),

                if (n.allowComments) ...[
                  const Text('댓글',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  StreamBuilder<List<NoticeComment>>(
                    stream: _fs.watchNoticeComments(n.id),
                    builder: (context, snap) {
                      final comments = snap.data ?? [];
                      if (comments.isEmpty) {
                        return const Text('아직 댓글이 없습니다.',
                            style: TextStyle(color: AppTheme.slate500));
                      }
                      return Column(
                        children: comments.map((c) {
                          final isMine = c.uid ==
                              FirebaseAuth.instance.currentUser?.uid;
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(c.author,
                                        style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 13,
                                            fontWeight: FontWeight.w500)),
                                    const SizedBox(width: 8),
                                    Text(
                                      timeago.format(
                                          DateTime
                                              .fromMillisecondsSinceEpoch(
                                                  c.createdAt),
                                          locale: 'ko'),
                                      style: const TextStyle(
                                          color: AppTheme.slate500,
                                          fontSize: 11),
                                    ),
                                    if (isMine) ...[
                                      const Spacer(),
                                      GestureDetector(
                                        onTap: () => _fs.deleteNoticeComment(
                                            n.id, c.id),
                                        child: const Text('삭제',
                                            style: TextStyle(
                                                color: AppTheme.red500,
                                                fontSize: 11)),
                                      ),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(c.content,
                                    style: const TextStyle(
                                        color: AppTheme.slate300,
                                        fontSize: 13)),
                              ],
                            ),
                          );
                        }).toList(),
                      );
                    },
                  ),
                ],
              ],
            ),
          ),

          if (n.allowComments)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
              decoration: const BoxDecoration(
                color: AppTheme.slate800,
                border: Border(top: BorderSide(color: AppTheme.slate700)),
              ),
              child: SafeArea(
                top: false,
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _commentCtrl,
                        decoration: const InputDecoration(
                          hintText: '댓글을 입력하세요...',
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 8),
                        ),
                        style: const TextStyle(fontSize: 14),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.send, color: AppTheme.blue400),
                      onPressed: _postComment,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
