import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/models/player_registration_post.dart';
import '../../core/services/community_access_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/editor/rich_text_editor.dart';

class PlayerRegistrationWriteScreen extends StatefulWidget {
  const PlayerRegistrationWriteScreen({
    super.key,
    required this.access,
    this.editPost,
  });

  final CommunityAccess access;
  final PlayerRegistrationPost? editPost;

  @override
  State<PlayerRegistrationWriteScreen> createState() =>
      _PlayerRegistrationWriteScreenState();
}

class _PlayerRegistrationWriteScreenState
    extends State<PlayerRegistrationWriteScreen> {
  final _fs = FirestoreService();
  final _titleCtrl = TextEditingController();
  String _contentDelta = '';
  String _category = '선수 등록';
  bool _submitting = false;

  bool get _isEditMode => widget.editPost != null;

  List<String> get _writableCategories {
    final categories = <String>[];
    if (widget.access.canWritePlayerRegistration) categories.add('선수 등록');
    if (widget.access.canWriteUniformRegistration) categories.add('유니폼 등록');
    return categories;
  }

  @override
  void initState() {
    super.initState();
    final post = widget.editPost;
    if (post != null) {
      _titleCtrl.text = post.title;
      _contentDelta = post.content;
      _category = post.category;
    } else {
      if (!_writableCategories.contains(_category) &&
          _writableCategories.isNotEmpty) {
        _category = _writableCategories.first;
      }
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  bool _canWriteCategory(String category) {
    if (category == '선수 등록') return widget.access.canWritePlayerRegistration;
    return widget.access.canWriteUniformRegistration;
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty || isDeltaEmpty(_contentDelta)) return;
    if (!_canWriteCategory(_category)) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    setState(() => _submitting = true);
    try {
      if (_isEditMode) {
        await _fs.updatePlayerRegistrationPost(widget.editPost!.id, {
          'title': title,
          'content': _contentDelta,
          'category': _category,
          'updatedAt': DateTime.now().millisecondsSinceEpoch,
        });
      } else {
        final post = PlayerRegistrationPost(
          id: '',
          title: title,
          content: _contentDelta,
          author: user.displayName ?? user.email?.split('@').first ?? '익명',
          uid: user.uid,
          category: _category,
          createdAt: DateTime.now().millisecondsSinceEpoch,
        );
        await _fs.addPlayerRegistrationPost(post);
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('저장 실패: $e')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = !_submitting &&
        _titleCtrl.text.trim().isNotEmpty &&
        !isDeltaEmpty(_contentDelta) &&
        _canWriteCategory(_category);

    if (_writableCategories.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('선수 등록 게시판')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              '글쓰기 권한이 없습니다.\n선수 등록: 관리자 / 유니폼 등록: 감독·관리자',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppTheme.slate400, height: 1.6),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditMode ? '게시글 수정' : '게시글 작성'),
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
                '작성 권한\n- 선수 등록: 관리자\n- 유니폼 등록: 감독/관리자',
                style: TextStyle(
                  color: AppTheme.blue400,
                  fontSize: 12,
                  height: 1.6,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 16),
            _sectionLabel('분류'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _category,
              dropdownColor: AppTheme.slate800,
              decoration: _inputDecoration('분류를 선택하세요'),
              items: _writableCategories
                  .map((c) => DropdownMenuItem(
                        value: c,
                        child: Text(c,
                            style: const TextStyle(color: Colors.white)),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _category = v!),
            ),
            const SizedBox(height: 16),
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
            _sectionLabel('내용'),
            const SizedBox(height: 8),
            RichTextEditor(
              initialValue: _contentDelta,
              onChanged: (v) => setState(() => _contentDelta = v),
              placeholder: '내용을 입력하세요',
              minHeight: 220,
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
          fontWeight: FontWeight.w700,
        ),
      );

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
