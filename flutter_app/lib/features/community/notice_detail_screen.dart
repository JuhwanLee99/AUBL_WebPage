import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/notice.dart';
import '../../core/models/notice_comment.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/editor/rich_text_editor.dart';
import '../../core/widgets/editor/rich_text_viewer.dart';

class NoticeDetailScreen extends StatefulWidget {
  const NoticeDetailScreen({super.key, required this.notice});

  final Notice notice;

  @override
  State<NoticeDetailScreen> createState() => _NoticeDetailScreenState();
}

class _NoticeDetailScreenState extends State<NoticeDetailScreen> {
  final _fs = FirestoreService();
  String _commentDelta = '';
  int _editorKey = 0;
  late Notice _notice;
  bool _isAdmin = false;

  static const List<String> _writeCategories = [
    '일반',
    '심판/기록원 모집',
    '징계',
    '경기공지',
    '긴급',
  ];

  @override
  void initState() {
    super.initState();
    _notice = widget.notice;
    _checkAdmin();
  }

  Future<void> _checkAdmin() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final token = await user.getIdTokenResult();
    if (!mounted) return;
    setState(() => _isAdmin = token.claims?['admin'] == true);
  }

  bool get _isOwner {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return false;
    if (_notice.uid.isEmpty) return false;
    return user.uid == _notice.uid;
  }

  bool get _canManageNotice => _isAdmin || _isOwner;

  Future<void> _postComment() async {
    if (isDeltaEmpty(_commentDelta)) return;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final content = _commentDelta;
    setState(() {
      _commentDelta = '';
      _editorKey++;
    });
    await _fs.addNoticeComment(
      _notice.id,
      NoticeComment(
        id: '',
        uid: user.uid,
        author: user.email?.split('@').first ?? '익명',
        content: content,
        createdAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  Future<void> _showEditNoticeDialog() async {
    final titleCtrl = TextEditingController(text: _notice.title);
    String contentDelta = _notice.content;
    String category = _notice.category;
    bool isImportant = _notice.isImportant;
    bool allowComments = _notice.allowComments;
    bool saving = false;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => Dialog(
          backgroundColor: AppTheme.slate800,
          insetPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '공지 수정',
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
                  initialValue: _notice.content,
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
                CheckboxListTile(
                  value: allowComments,
                  onChanged: (v) =>
                      setDialogState(() => allowComments = v ?? true),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('댓글 허용'),
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
                                if (!mounted) return;
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('제목과 내용을 입력해주세요.'),
                                  ),
                                );
                                return;
                              }
                              setDialogState(() => saving = true);
                              try {
                                await _fs.updateNotice(
                                  noticeId: _notice.id,
                                  title: title,
                                  category: category,
                                  content: contentDelta,
                                  isImportant: isImportant,
                                  allowComments: allowComments,
                                );
                                final fresh = await _fs.getNotice(_notice.id);
                                if (fresh != null && mounted) {
                                  setState(() => _notice = fresh);
                                }
                                if (ctx.mounted) Navigator.pop(ctx);
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('공지가 수정되었습니다.'),
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
                      child: Text(saving ? '저장 중...' : '저장'),
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

  Future<void> _deleteNotice() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.slate800,
        title: const Text('공지 삭제', style: TextStyle(color: Colors.white)),
        content: const Text(
          '이 공지를 삭제하시겠습니까?',
          style: TextStyle(color: AppTheme.slate300),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('삭제', style: TextStyle(color: AppTheme.red500)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await _fs.deleteNotice(_notice.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('공지 삭제 중 오류가 발생했습니다: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = _notice;
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('공지 상세'),
        actions: [
          if (_canManageNotice) ...[
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              onPressed: _showEditNoticeDialog,
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppTheme.red500),
              onPressed: _deleteNotice,
            ),
          ],
        ],
      ),
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
                  style:
                      const TextStyle(color: AppTheme.slate500, fontSize: 13),
                ),
                const Divider(height: 24),
                RichTextViewer(
                  content: n.content,
                  fontSize: 14,
                  color: AppTheme.slate300,
                ),
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
                          final isMine =
                              c.uid == FirebaseAuth.instance.currentUser?.uid;
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
                                          DateTime.fromMillisecondsSinceEpoch(
                                              c.createdAt),
                                          locale: 'ko'),
                                      style: const TextStyle(
                                          color: AppTheme.slate500,
                                          fontSize: 11),
                                    ),
                                    if (isMine) ...[
                                      const Spacer(),
                                      GestureDetector(
                                        onTap: () =>
                                            _fs.deleteNoticeComment(n.id, c.id),
                                        child: const Text('삭제',
                                            style: TextStyle(
                                                color: AppTheme.red500,
                                                fontSize: 11)),
                                      ),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 4),
                                RichTextViewer(
                                  content: c.content,
                                  fontSize: 13,
                                  color: AppTheme.slate300,
                                ),
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
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: const BoxDecoration(
                color: AppTheme.slate800,
                border: Border(top: BorderSide(color: AppTheme.slate700)),
              ),
              child: SafeArea(
                top: false,
                child: user == null
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            constraints: const BoxConstraints(minHeight: 60),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 18),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1e293b),
                              borderRadius: BorderRadius.circular(10),
                              border:
                                  Border.all(color: const Color(0xFF334155)),
                            ),
                            child: const Text(
                              '로그인이 필요합니다.',
                              style: TextStyle(
                                color: AppTheme.slate400,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Align(
                            alignment: Alignment.centerRight,
                            child: Icon(Icons.send, color: AppTheme.slate600),
                          ),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          RichTextEditor(
                            key: ValueKey(_editorKey),
                            onChanged: (v) => _commentDelta = v,
                            mini: true,
                            placeholder: '댓글을 입력하세요...',
                            minHeight: 60,
                          ),
                          const SizedBox(height: 6),
                          Align(
                            alignment: Alignment.centerRight,
                            child: IconButton(
                              icon: const Icon(Icons.send,
                                  color: AppTheme.blue400),
                              onPressed: _postComment,
                            ),
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
