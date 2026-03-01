import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/inquiry_post.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/editor/rich_text_editor.dart';
import '../../core/widgets/editor/rich_text_viewer.dart';
import 'inquiry_write_screen.dart';

class InquiryDetailScreen extends StatefulWidget {
  const InquiryDetailScreen({super.key, required this.post});

  final InquiryPost post;

  @override
  State<InquiryDetailScreen> createState() => _InquiryDetailScreenState();
}

class _InquiryDetailScreenState extends State<InquiryDetailScreen> {
  final _fs = FirestoreService();
  String _commentDelta = '';
  int _editorKey = 0;
  late InquiryPost _post;
  bool _isAdmin = false;

  @override
  void initState() {
    super.initState();
    _post = widget.post;
    _checkAdmin();
  }

  Future<void> _checkAdmin() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final token = await user.getIdTokenResult();
    if (mounted) setState(() => _isAdmin = token.claims?['admin'] == true);
  }

  User? get _user => FirebaseAuth.instance.currentUser;

  bool get _isAccessible =>
      !_post.isPrivate || _user?.uid == _post.uid || _isAdmin;

  bool get _canEdit => _user?.uid == _post.uid || _isAdmin;

  Color _platformColor(String p) =>
      p == 'app' ? const Color(0xFF818CF8) : const Color(0xFF34D399);

  Color _categoryColor(String cat) => switch (cat) {
        '기능 개선' => AppTheme.blue400,
        '버그 신고' => const Color(0xFFF87171),
        '사용 문의' => const Color(0xFF4ADE80),
        '경기/기록 오류' => const Color(0xFFFB923C),
        _ => AppTheme.slate400,
      };

  Future<void> _postComment() async {
    if (isDeltaEmpty(_commentDelta) || _user == null) return;
    final content = _commentDelta;
    setState(() {
      _commentDelta = '';
      _editorKey++;
    });
    await _fs.addInquiryComment(
      _post.id,
      InquiryComment(
        id: '',
        content: content,
        author: _user!.displayName ?? _user!.email?.split('@').first ?? '익명',
        uid: _user!.uid,
        createdAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  Future<void> _deletePost() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.slate800,
        title: const Text('삭제 확인', style: TextStyle(color: Colors.white)),
        content: const Text('게시글을 삭제하시겠습니까?',
            style: TextStyle(color: AppTheme.slate300)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('삭제', style: TextStyle(color: Color(0xFFF87171))),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _fs.deleteInquiry(_post.id);
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('건의/문의'),
        actions: [
          if (_canEdit) ...[
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              onPressed: () async {
                final updated = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                      builder: (_) => InquiryWriteScreen(editPost: _post)),
                );
                if (updated == true && mounted) {
                  // 수정 후 최신 데이터 다시 로드
                  final fresh = await _fs.getInquiry(_post.id);
                  if (fresh != null && mounted) setState(() => _post = fresh);
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
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (!_isAccessible)
                  // ── 비밀글 접근 불가 ──
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Column(
                        children: [
                          Icon(Icons.lock_outline,
                              size: 56, color: AppTheme.slate500),
                          SizedBox(height: 16),
                          Text('비밀글입니다.',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700)),
                          SizedBox(height: 8),
                          Text('작성자와 관리자만 열람할 수 있습니다.',
                              style: TextStyle(
                                  color: AppTheme.slate500, fontSize: 13)),
                        ],
                      ),
                    ),
                  )
                else ...[
                  // ── 뱃지 & 메타 ──
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      _badge(_post.platform == 'app' ? '앱' : '웹',
                          _platformColor(_post.platform)),
                      _badge(_post.category, _categoryColor(_post.category)),
                      // 처리 상태
                      if (_isAdmin)
                        _buildStatusDropdown()
                      else
                        _badge(_post.status, _statusColor(_post.status)),
                      if (_post.isPrivate)
                        const Icon(Icons.lock_outline,
                            size: 14, color: AppTheme.slate500),
                    ],
                  ),

                  const SizedBox(height: 12),
                  // ── 제목 ──
                  Text(_post.title,
                      style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.white)),
                  const SizedBox(height: 6),
                  // ── 작성자·날짜 ──
                  Text(
                    '${_post.author} · ${timeago.format(DateTime.fromMillisecondsSinceEpoch(_post.createdAt), locale: 'ko')}',
                    style:
                        const TextStyle(color: AppTheme.slate500, fontSize: 12),
                  ),
                  const Divider(height: 28),
                  // ── 본문 ──
                  RichTextViewer(
                      content: _post.content,
                      fontSize: 14,
                      color: AppTheme.slate300,
                      lineHeight: 1.7),
                  const SizedBox(height: 32),

                  // ── 댓글 ──
                  const Text('댓글',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 10),
                  StreamBuilder<List<InquiryComment>>(
                    stream: _fs.watchInquiryComments(_post.id),
                    builder: (ctx, snap) {
                      final comments = snap.data ?? [];
                      if (comments.isEmpty) {
                        return const Text('아직 댓글이 없습니다.',
                            style: TextStyle(
                                color: AppTheme.slate500, fontSize: 13));
                      }
                      return Column(
                        children: comments.map((c) {
                          final isMine = c.uid == _user?.uid;
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
                                    if (isMine || _isAdmin) ...[
                                      const Spacer(),
                                      GestureDetector(
                                        onTap: () => _fs.deleteInquiryComment(
                                            _post.id, c.id),
                                        child: const Text('삭제',
                                            style: TextStyle(
                                                color: Color(0xFFF87171),
                                                fontSize: 11)),
                                      ),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 4),
                                RichTextViewer(
                                    content: c.content,
                                    fontSize: 13,
                                    color: AppTheme.slate300),
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

          // ── 댓글 입력창 (접근 가능) ──
          if (_isAccessible)
            Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: const BoxDecoration(
                color: AppTheme.slate800,
                border: Border(top: BorderSide(color: AppTheme.slate700)),
              ),
              child: SafeArea(
                top: false,
                child: _user == null
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

  Color _statusColor(String status) => switch (status) {
        '미처리' => const Color(0xFFF87171),
        '처리 중' => const Color(0xFFFBBF24),
        '처리 완료' => const Color(0xFF4ADE80),
        _ => AppTheme.slate400,
      };

  Widget _buildStatusDropdown() {
    final current = _post.status;
    final color = _statusColor(current);
    return GestureDetector(
      onTap: () async {
        final selected = await showModalBottomSheet<String>(
          context: context,
          backgroundColor: AppTheme.slate800,
          builder: (ctx) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('처리 상태 변경',
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15)),
              ),
              ...InquiryPost.statuses.map((s) => ListTile(
                    title: Text(s, style: TextStyle(color: _statusColor(s))),
                    trailing: s == current
                        ? const Icon(Icons.check, color: Colors.white)
                        : null,
                    onTap: () => Navigator.pop(ctx, s),
                  )),
              const SizedBox(height: 8),
            ],
          ),
        );
        if (selected == null || selected == current || !mounted) return;
        try {
          await _fs.updateInquiry(_post.id, {
            'status': selected,
            'updatedAt': DateTime.now().millisecondsSinceEpoch,
          });
          setState(() => _post = InquiryPost(
                id: _post.id,
                title: _post.title,
                content: _post.content,
                author: _post.author,
                uid: _post.uid,
                platform: _post.platform,
                category: _post.category,
                isPrivate: _post.isPrivate,
                status: selected,
                createdAt: _post.createdAt,
                updatedAt: DateTime.now().millisecondsSinceEpoch,
              ));
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text('상태 변경 실패: $e')));
          }
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(5),
          border: Border.all(color: color.withValues(alpha: 0.5)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(current,
                style: TextStyle(
                    color: color, fontSize: 12, fontWeight: FontWeight.w700)),
            const SizedBox(width: 3),
            Icon(Icons.arrow_drop_down, color: color, size: 16),
          ],
        ),
      ),
    );
  }

  Widget _badge(String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(5),
        ),
        child: Text(label,
            style: TextStyle(
                color: color, fontSize: 12, fontWeight: FontWeight.w700)),
      );
}
