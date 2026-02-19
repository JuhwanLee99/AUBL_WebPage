import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/models/inquiry_post.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';

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
  final _contentCtrl = TextEditingController();

  String _platform = 'app';
  String _category = '기능 개선';
  bool _isPrivate = false;
  bool _submitting = false;

  static const _categories = ['기능 개선', '버그 신고', '사용 문의', '경기/기록 오류', '기타'];

  bool get _isEditMode => widget.editPost != null;

  @override
  void initState() {
    super.initState();
    final p = widget.editPost;
    if (p != null) {
      _titleCtrl.text = p.title;
      _contentCtrl.text = p.content;
      _platform = p.platform;
      _category = p.category;
      _isPrivate = p.isPrivate;
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _contentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    final content = _contentCtrl.text.trim();
    if (title.isEmpty || content.isEmpty) return;

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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('저장 실패: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = !_submitting &&
        _titleCtrl.text.trim().isNotEmpty &&
        _contentCtrl.text.trim().isNotEmpty;

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
                    child: CircularProgressIndicator(strokeWidth: 2))
                : Text(
                    _isEditMode ? '수정' : '완료',
                    style: TextStyle(
                      color: canSubmit ? AppTheme.blue400 : AppTheme.slate500,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.blue500.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
                border:
                    Border.all(color: AppTheme.blue500.withValues(alpha: 0.35)),
              ),
              child: const Text(
                '스크린샷 등 첨부파일이 필요한 경우, 게시글 등록 후 aublcau@gmail.com으로 전송해 주세요.',
                style: TextStyle(
                  color: AppTheme.blue400,
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
                _platformBtn('app', '앱', const Color(0xFF818CF8)),
                const SizedBox(width: 8),
                _platformBtn('web', '웹', const Color(0xFF34D399)),
              ],
            ),
            const SizedBox(height: 16),

            // ── 말머리(분류) ──
            _sectionLabel('분류'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _category,
              dropdownColor: AppTheme.slate800,
              decoration: _inputDecoration('분류를 선택하세요'),
              items: _categories
                  .map((c) => DropdownMenuItem(
                        value: c,
                        child: Text(c,
                            style: const TextStyle(color: Colors.white)),
                      ))
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
              style: const TextStyle(color: Colors.white),
              decoration: _inputDecoration('제목을 입력하세요'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),

            // ── 본문 ──
            _sectionLabel('내용'),
            const SizedBox(height: 8),
            TextField(
              controller: _contentCtrl,
              maxLines: 10,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: _inputDecoration('내용을 입력하세요'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 16),

            // ── 비밀글 ──
            Container(
              decoration: BoxDecoration(
                color: AppTheme.slate800.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.slate700),
              ),
              child: SwitchListTile(
                value: _isPrivate,
                onChanged: (v) => setState(() => _isPrivate = v),
                activeThumbColor: AppTheme.blue400,
                title: const Text('비밀글',
                    style: TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w600)),
                subtitle: const Text(
                  '작성자와 관리자만 내용을 볼 수 있습니다',
                  style: TextStyle(color: AppTheme.slate500, fontSize: 12),
                ),
                secondary: Icon(
                  _isPrivate ? Icons.lock : Icons.lock_open,
                  color: _isPrivate ? AppTheme.blue400 : AppTheme.slate500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String label) => Text(
        label,
        style: const TextStyle(
            color: AppTheme.slate400,
            fontSize: 13,
            fontWeight: FontWeight.w700),
      );

  Widget _platformBtn(String value, String label, Color color) {
    final selected = _platform == value;
    return GestureDetector(
      onTap: () => setState(() => _platform = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.2) : AppTheme.slate800,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? color : AppTheme.slate700,
              width: selected ? 1.5 : 1),
        ),
        child: Text(
          label,
          style: TextStyle(
              color: selected ? color : AppTheme.slate400,
              fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppTheme.slate500),
        filled: true,
        fillColor: AppTheme.slate800.withValues(alpha: 0.6),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTheme.slate700),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTheme.slate700),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTheme.blue500),
        ),
      );
}
