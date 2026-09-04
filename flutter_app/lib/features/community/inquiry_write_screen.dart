import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/models/inquiry_post.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/rich_text_editor.dart';
import '../../core/widgets/editor/delta_utils.dart';

class InquiryWriteScreen extends StatefulWidget {
  const InquiryWriteScreen({super.key, this.editPost});

  /// 수정 모드일 때 기존 게시글을 전달
  final InquiryPost? editPost;

  @override
  State<InquiryWriteScreen> createState() => _InquiryWriteScreenState();
}

class _InquiryWriteScreenState extends State<InquiryWriteScreen> {
  final _fs = FirestoreService();
  final _titleCtrl = TextEditingController();
  String _contentDelta = '';

  String _platform = 'app';
  String _category = '기능 개선';
  bool _isPrivate = false;
  bool _submitting = false;

  static final _categories = ['기능 개선', '버그 신고', '사용 문의', '경기/기록 오류', '기타'];

  bool get _isEditMode => widget.editPost != null;

  @override
  void initState() {
    super.initState();
    final p = widget.editPost;
    if (p != null) {
      _titleCtrl.text = p.title;
      _contentDelta = p.content;
      _platform = p.platform;
      _category = p.category;
      _isPrivate = p.isPrivate;
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty || isDeltaEmpty(_contentDelta)) return;
    final content = _contentDelta;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    setState(() => _submitting = true);
    try {
      if (_isEditMode) {
        await _fs.updateInquiry(widget.editPost!.id, {
          'title': title,
          'content': content,
          'platform': _platform,
          'category': _category,
          'isPrivate': _isPrivate,
          'updatedAt': DateTime.now().millisecondsSinceEpoch,
        });
      } else {
        final post = InquiryPost(
          id: '',
          title: title,
          content: content,
          author: user.displayName ?? user.email?.split('@').first ?? '익명',
          uid: user.uid,
          platform: _platform,
          category: _category,
          isPrivate: _isPrivate,
          status: '미처리',
          createdAt: DateTime.now().millisecondsSinceEpoch,
        );
        await _fs.addInquiry(post);
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('저장 실패: $e')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit =
        !_submitting &&
        _titleCtrl.text.trim().isNotEmpty &&
        !isDeltaEmpty(_contentDelta);

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditMode ? '게시글 수정' : '건의/문의 작성'),
        actions: [
          TextButton(
            onPressed: canSubmit ? _submit : null,
            child: _submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    _isEditMode ? '수정' : '완료',
                    style: TextStyle(
                      color: canSubmit
                          ? context.aublColors.cobalt
                          : context.aublColors.muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final outerInset = constraints.maxWidth > 820
              ? (constraints.maxWidth - 820) / 2
              : 0.0;
          return SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              outerInset + 16,
              16,
              outerInset + 16,
              32,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.aublColors.cobalt.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: context.aublColors.cobalt.withValues(alpha: 0.35),
                    ),
                  ),
                  child: Text(
                    '첨부파일 업로드는 현재 지원하지 않습니다.\n스크린샷 등 파일이 필요한 경우 구글 드라이브 등 외부 링크를 본문에 첨부하거나, 게시글 작성 후 aublcau@gmail.com으로 전송해 주세요.',
                    style: TextStyle(
                      color: context.aublColors.cobalt,
                      fontSize: 12,
                      height: 1.6,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // ── 플랫폼 선택 ──
                _sectionLabel('플랫폼'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _platformBtn('app', '앱', context.aublColors.cobalt),
                    const SizedBox(width: 8),
                    _platformBtn('web', '웹', context.aublColors.navy),
                  ],
                ),
                const SizedBox(height: 16),

                // ── 말머리(분류) ──
                _sectionLabel('분류'),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _category,
                  dropdownColor: context.aublColors.surface,
                  decoration: _inputDecoration('분류를 선택하세요'),
                  items: _categories
                      .map(
                        (c) => DropdownMenuItem(
                          value: c,
                          child: Text(
                            c,
                            style: TextStyle(color: context.aublColors.ink),
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setState(() => _category = v!),
                ),
                const SizedBox(height: 16),

                // ── 제목 ──
                _sectionLabel('제목'),
                const SizedBox(height: 8),
                TextField(
                  controller: _titleCtrl,
                  maxLength: 100,
                  style: TextStyle(color: context.aublColors.ink),
                  decoration: _inputDecoration('제목을 입력하세요'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 8),

                // ── 본문 ──
                _sectionLabel('내용'),
                const SizedBox(height: 8),
                RichTextEditor(
                  initialValue: _contentDelta,
                  onChanged: (v) => setState(() => _contentDelta = v),
                  placeholder: '내용을 입력하세요',
                  minHeight: 200,
                ),
                const SizedBox(height: 16),

                // ── 비밀글 ──
                Container(
                  decoration: BoxDecoration(
                    color: context.aublColors.surface.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: context.aublColors.line),
                  ),
                  child: SwitchListTile(
                    value: _isPrivate,
                    onChanged: (v) => setState(() => _isPrivate = v),
                    activeThumbColor: context.aublColors.cobalt,
                    title: Text(
                      '비밀글',
                      style: TextStyle(
                        color: context.aublColors.ink,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      '작성자와 관리자만 내용을 볼 수 있습니다',
                      style: TextStyle(
                        color: context.aublColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    secondary: Icon(
                      _isPrivate ? Icons.lock : Icons.lock_open,
                      color: _isPrivate
                          ? context.aublColors.cobalt
                          : context.aublColors.muted,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _sectionLabel(String label) => Text(
    label,
    style: TextStyle(
      color: context.aublColors.muted,
      fontSize: 13,
      fontWeight: FontWeight.w700,
    ),
  );

  Widget _platformBtn(String value, String label, Color color) {
    final selected = _platform == value;
    return Material(
      color: selected
          ? color.withValues(alpha: 0.1)
          : context.aublColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(3),
        side: BorderSide(
          color: selected ? color : context.aublColors.line,
          width: selected ? 1.5 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        borderRadius: BorderRadius.circular(3),
        onTap: () => setState(() => _platform = value),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
            child: Center(
              child: Text(
                label,
                style: TextStyle(
                  color: selected ? color : context.aublColors.muted,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) => InputDecoration(
    hintText: hint,
    hintStyle: TextStyle(color: context.aublColors.muted),
    filled: true,
    fillColor: context.aublColors.surface.withValues(alpha: 0.6),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(4),
      borderSide: BorderSide(color: context.aublColors.line),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(4),
      borderSide: BorderSide(color: context.aublColors.line),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(4),
      borderSide: BorderSide(color: context.aublColors.cobalt),
    ),
  );
}
