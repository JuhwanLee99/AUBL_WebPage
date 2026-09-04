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
        !isDeltaEmpty(_contentDelta) &&
        _canWriteCategory(_category);

    if (_writableCategories.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('선수 등록 게시판')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              '글쓰기 권한이 없습니다.\n선수 등록: 관리자 / 유니폼 등록: 감독·관리자',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.aublColors.muted, height: 1.6),
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
                    '작성 권한\n- 선수 등록: 관리자\n- 유니폼 등록: 감독/관리자',
                    style: TextStyle(
                      color: context.aublColors.cobalt,
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
                  dropdownColor: context.aublColors.surface,
                  decoration: _inputDecoration('분류를 선택하세요'),
                  items: _writableCategories
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
