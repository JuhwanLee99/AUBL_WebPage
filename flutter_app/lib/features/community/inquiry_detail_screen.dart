import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/inquiry_post.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/moderation_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/moderation/e911_emergency_icon.dart';
import '../../core/widgets/moderation/moderation_dialogs.dart';
import '../../core/widgets/editor/rich_text_editor.dart';
import '../../core/widgets/editor/rich_text_viewer.dart';
import 'inquiry_write_screen.dart';

enum _InquiryModerationAction {
  report,
  block,
  delete,
}

class InquiryDetailScreen extends StatefulWidget {
  const InquiryDetailScreen({super.key, required this.post});

  final InquiryPost post;

  @override
  State<InquiryDetailScreen> createState() => _InquiryDetailScreenState();
}

class _InquiryDetailScreenState extends State<InquiryDetailScreen> {
  final _fs = FirestoreService();
  final _moderationService = ModerationService();
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
      p == 'app' ? context.aublColors.cobalt : context.aublColors.success;

  Color _categoryColor(String cat) => switch (cat) {
        '기능 개선' => context.aublColors.cobalt,
        '버그 신고' => context.aublColors.danger,
        '사용 문의' => context.aublColors.success,
        '경기/기록 오류' => context.aublColors.warning,
        _ => context.aublColors.muted,
      };

  String _currentUserLabel(User user) {
    return user.displayName ?? user.email ?? user.uid;
  }

  String _clipPreview(String raw, {int maxLength = 180}) {
    final text = raw.replaceAll('\n', ' ').trim();
    if (text.length <= maxLength) return text;
    return '${text.substring(0, maxLength)}...';
  }

  Future<void> _handleModerationAction({
    required _InquiryModerationAction action,
    required String targetUid,
    required String targetLabel,
    required String contentDomain,
    required String contentId,
    required String contentPreview,
    String? parentContentId,
  }) async {
    final reporter = _user;
    if (reporter == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('로그인 후 신고/차단할 수 있습니다.')),
      );
      return;
    }
    if (targetUid.isEmpty || targetUid == reporter.uid) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('본인 계정은 신고하거나 차단할 수 없습니다.')),
      );
      return;
    }
    if (action == _InquiryModerationAction.delete) return;

    final reason = await showModerationReasonDialog(
      context,
      title: action == _InquiryModerationAction.block ? '사용자 차단' : '콘텐츠 신고',
      confirmLabel: action == _InquiryModerationAction.block ? '차단' : '신고',
    );
    if (reason == null) return;

    final payload = ModerationReportPayload(
      action: action == _InquiryModerationAction.block ? 'block' : 'report',
      reasonType: reason.reasonCode,
      reasonDetail: reason.detail,
      targetUid: targetUid,
      targetLabel: targetLabel,
      contentDomain: contentDomain,
      contentId: contentId,
      parentContentId: parentContentId,
      contentPreview: _clipPreview(contentPreview),
    );

    try {
      if (action == _InquiryModerationAction.block) {
        await _moderationService.blockUserAndReport(
          blockerUid: reporter.uid,
          blockerLabel: _currentUserLabel(reporter),
          payload: payload,
        );
      } else {
        await _moderationService.reportContent(
          reporterUid: reporter.uid,
          reporterLabel: _currentUserLabel(reporter),
          payload: payload,
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            action == _InquiryModerationAction.block
                ? '사용자를 차단하고 운영팀에 신고했습니다.'
                : '신고가 접수되었습니다. 운영팀이 확인 후 조치합니다.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('신고 처리 중 오류가 발생했습니다: $e')),
      );
    }
  }

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
        backgroundColor: context.aublColors.surface,
        title: Text('삭제 확인', style: TextStyle(color: context.aublColors.ink)),
        content: Text('게시글을 삭제하시겠습니까?',
            style: TextStyle(color: context.aublColors.ink)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child:
                Text('삭제', style: TextStyle(color: context.aublColors.danger)),
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
    final viewer = _user;
    final canModeratePost = viewer != null &&
        _post.uid.isNotEmpty &&
        _post.uid != viewer.uid &&
        _isAccessible;

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
                  final fresh = await _fs.getInquiry(_post.id);
                  if (fresh != null && mounted) setState(() => _post = fresh);
                }
              },
            ),
            IconButton(
              icon:
                  Icon(Icons.delete_outline, color: context.aublColors.danger),
              onPressed: _deletePost,
            ),
          ],
          if (canModeratePost)
            PopupMenuButton<_InquiryModerationAction>(
              icon: E911EmergencyIcon(color: context.aublColors.muted),
              onSelected: (action) {
                _handleModerationAction(
                  action: action,
                  targetUid: _post.uid,
                  targetLabel: _post.author,
                  contentDomain: 'inquiryPost',
                  contentId: _post.id,
                  contentPreview:
                      '${_post.title}\n${deltaToPreviewText(_post.content)}',
                );
              },
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: _InquiryModerationAction.report,
                  child: Text('게시글 신고'),
                ),
                const PopupMenuItem(
                  value: _InquiryModerationAction.block,
                  child: Text('작성자 차단'),
                ),
              ],
            ),
        ],
      ),
      body: StreamBuilder<Set<String>>(
        stream: viewer == null
            ? Stream.value(<String>{})
            : _moderationService.watchBlockedUserIds(viewer.uid),
        builder: (context, blockedSnapshot) {
          final blockedUserIds = blockedSnapshot.data ?? <String>{};
          final isPostBlocked = blockedUserIds.contains(_post.uid);

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (isPostBlocked)
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 48),
                          child: Column(
                            children: [
                              Icon(
                                Icons.block,
                                size: 56,
                                color: context.aublColors.muted,
                              ),
                              const SizedBox(height: 16),
                              Text(
                                '차단한 사용자의 게시글입니다.',
                                style: TextStyle(
                                  color: context.aublColors.ink,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '계정 화면에서 차단을 해제하면 다시 볼 수 있습니다.',
                                style: TextStyle(
                                  color: context.aublColors.muted,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    else if (!_isAccessible)
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 48),
                          child: Column(
                            children: [
                              Icon(Icons.lock_outline,
                                  size: 56, color: context.aublColors.muted),
                              const SizedBox(height: 16),
                              Text('비밀글입니다.',
                                  style: TextStyle(
                                      color: context.aublColors.ink,
                                      fontSize: 18,
                                      fontWeight: FontWeight.w700)),
                              const SizedBox(height: 8),
                              Text('작성자와 관리자만 열람할 수 있습니다.',
                                  style: TextStyle(
                                      color: context.aublColors.muted,
                                      fontSize: 13)),
                            ],
                          ),
                        ),
                      )
                    else ...[
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          _badge(_post.platform == 'app' ? '앱' : '웹',
                              _platformColor(_post.platform)),
                          _badge(
                              _post.category, _categoryColor(_post.category)),
                          if (_isAdmin)
                            _buildStatusDropdown()
                          else
                            _badge(_post.status, _statusColor(_post.status)),
                          if (_post.isPrivate)
                            Icon(Icons.lock_outline,
                                size: 14, color: context.aublColors.muted),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(_post.title,
                          style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: context.aublColors.ink)),
                      const SizedBox(height: 6),
                      Text(
                        '${_post.author} · ${timeago.format(DateTime.fromMillisecondsSinceEpoch(_post.createdAt), locale: 'ko')}',
                        style: TextStyle(
                            color: context.aublColors.muted, fontSize: 12),
                      ),
                      const Divider(height: 28),
                      RichTextViewer(
                          content: _post.content,
                          fontSize: 14,
                          color: context.aublColors.ink,
                          lineHeight: 1.7),
                      const SizedBox(height: 32),
                      Text(
                        '댓글',
                        style: TextStyle(
                            color: context.aublColors.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '게시글/댓글 우측 메뉴에서 신고 또는 차단할 수 있습니다.',
                        style: TextStyle(
                            color: context.aublColors.muted, fontSize: 11),
                      ),
                      const SizedBox(height: 10),
                      StreamBuilder<List<InquiryComment>>(
                        stream: _fs.watchInquiryComments(_post.id),
                        builder: (ctx, snap) {
                          final comments = (snap.data ?? [])
                              .where((c) => !blockedUserIds.contains(c.uid))
                              .toList();
                          if (comments.isEmpty) {
                            return Text(
                              '아직 댓글이 없습니다.',
                              style: TextStyle(
                                  color: context.aublColors.muted,
                                  fontSize: 13),
                            );
                          }
                          return Column(
                            children: comments.map((c) {
                              final isMine = c.uid == viewer?.uid;
                              final canReport = viewer != null &&
                                  c.uid.isNotEmpty &&
                                  c.uid != viewer.uid;
                              final canDelete = isMine || _isAdmin;
                              final showMenu = canDelete || canReport;

                              return Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 6),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(c.author,
                                            style: TextStyle(
                                                color: context.aublColors.ink,
                                                fontSize: 13,
                                                fontWeight: FontWeight.w500)),
                                        const SizedBox(width: 8),
                                        Text(
                                          timeago.format(
                                              DateTime
                                                  .fromMillisecondsSinceEpoch(
                                                      c.createdAt),
                                              locale: 'ko'),
                                          style: TextStyle(
                                              color: context.aublColors.muted,
                                              fontSize: 11),
                                        ),
                                        if (showMenu) ...[
                                          const Spacer(),
                                          PopupMenuButton<
                                              _InquiryModerationAction>(
                                            padding: EdgeInsets.zero,
                                            icon: E911EmergencyIcon(
                                              size: 18,
                                              color: context.aublColors.muted,
                                            ),
                                            onSelected: (action) {
                                              if (action ==
                                                  _InquiryModerationAction
                                                      .delete) {
                                                _fs.deleteInquiryComment(
                                                    _post.id, c.id);
                                                return;
                                              }
                                              _handleModerationAction(
                                                action: action,
                                                targetUid: c.uid,
                                                targetLabel: c.author,
                                                contentDomain: 'inquiryComment',
                                                contentId: c.id,
                                                parentContentId: _post.id,
                                                contentPreview:
                                                    deltaToPreviewText(
                                                        c.content),
                                              );
                                            },
                                            itemBuilder: (context) {
                                              final items = <PopupMenuEntry<
                                                  _InquiryModerationAction>>[];
                                              if (canDelete) {
                                                items.add(
                                                  const PopupMenuItem(
                                                    value:
                                                        _InquiryModerationAction
                                                            .delete,
                                                    child: Text('댓글 삭제'),
                                                  ),
                                                );
                                              }
                                              if (canReport) {
                                                if (items.isNotEmpty) {
                                                  items.add(
                                                      const PopupMenuDivider());
                                                }
                                                items.addAll([
                                                  const PopupMenuItem(
                                                    value:
                                                        _InquiryModerationAction
                                                            .report,
                                                    child: Text('댓글 신고'),
                                                  ),
                                                  const PopupMenuItem(
                                                    value:
                                                        _InquiryModerationAction
                                                            .block,
                                                    child: Text('작성자 차단'),
                                                  ),
                                                ]);
                                              }
                                              return items;
                                            },
                                          ),
                                        ],
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    RichTextViewer(
                                        content: c.content,
                                        fontSize: 13,
                                        color: context.aublColors.ink),
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
              if (_isAccessible && !isPostBlocked)
                Container(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  decoration: BoxDecoration(
                    color: context.aublColors.surface,
                    border:
                        Border(top: BorderSide(color: context.aublColors.line)),
                  ),
                  child: SafeArea(
                    top: false,
                    child: viewer == null
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                constraints:
                                    const BoxConstraints(minHeight: 60),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 18),
                                decoration: BoxDecoration(
                                  color: context.aublColors.surface,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                      color: context.aublColors.line),
                                ),
                                child: Text(
                                  '로그인이 필요합니다.',
                                  style: TextStyle(
                                    color: context.aublColors.muted,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Align(
                                alignment: Alignment.centerRight,
                                child: Icon(Icons.send,
                                    color: context.aublColors.lineStrong),
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
                                  icon: Icon(Icons.send,
                                      color: context.aublColors.cobalt),
                                  onPressed: _postComment,
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Color _statusColor(String status) => switch (status) {
        '미처리' => context.aublColors.danger,
        '처리 중' => context.aublColors.warning,
        '처리 완료' => context.aublColors.success,
        _ => context.aublColors.muted,
      };

  Widget _buildStatusDropdown() {
    final current = _post.status;
    final color = _statusColor(current);
    return GestureDetector(
      onTap: () async {
        final selected = await showModalBottomSheet<String>(
          context: context,
          backgroundColor: context.aublColors.surface,
          builder: (ctx) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('처리 상태 변경',
                    style: TextStyle(
                        color: context.aublColors.ink,
                        fontWeight: FontWeight.w700,
                        fontSize: 15)),
              ),
              ...InquiryPost.statuses.map((s) => ListTile(
                    title: Text(s, style: TextStyle(color: _statusColor(s))),
                    trailing: s == current
                        ? Icon(Icons.check, color: context.aublColors.ink)
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
