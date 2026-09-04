import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../theme/app_theme.dart';
import 'delta_utils.dart';
import 'table_embed.dart';

/// 게시글/댓글 리치 텍스트 에디터
///
/// [mini] = true: 댓글용 미니 툴바 (볼드/이탤릭/링크)
/// [mini] = false: 게시글용 풀 툴바 (볼드/이탤릭/밑줄/목록/링크/표/이미지/동영상)
class RichTextEditor extends StatefulWidget {
  const RichTextEditor({
    super.key,
    required this.onChanged,
    this.initialValue = '',
    this.mini = false,
    this.placeholder = '내용을 입력하세요.',
    this.minHeight = 200.0,
  });

  final String initialValue;
  final ValueChanged<String> onChanged;
  final bool mini;
  final String placeholder;
  final double minHeight;

  @override
  State<RichTextEditor> createState() => _RichTextEditorState();
}

class _RichTextEditorState extends State<RichTextEditor> {
  late QuillController _controller;
  final FocusNode _focusNode = FocusNode();
  bool _ignoreNextChange = false;

  @override
  void initState() {
    super.initState();
    _controller = safeControllerFrom(widget.initialValue);
    _controller.addListener(_onControllerChanged);
  }

  @override
  void didUpdateWidget(covariant RichTextEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 외부에서 value가 빈 값으로 리셋될 때 (예: 댓글 등록 후 초기화)
    if (widget.initialValue != oldWidget.initialValue &&
        isDeltaEmpty(widget.initialValue)) {
      _ignoreNextChange = true;
      _controller.removeListener(_onControllerChanged);
      _controller.dispose();
      _controller = safeControllerFrom(widget.initialValue);
      _controller.addListener(_onControllerChanged);
      _ignoreNextChange = false;
    }
  }

  void _onControllerChanged() {
    if (_ignoreNextChange) return;
    widget.onChanged(controllerToJson(_controller));
  }

  @override
  void dispose() {
    _controller.removeListener(_onControllerChanged);
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _showImageUrlDialog() async {
    final ctrl = TextEditingController();
    final url = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final colors = ctx.aublColors;
        return AlertDialog(
          backgroundColor: colors.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          title: Text(
            '이미지 URL 입력',
            style: TextStyle(
              color: colors.navyStrong,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: TextField(
            controller: ctrl,
            autofocus: true,
            style: TextStyle(color: colors.ink),
            decoration: InputDecoration(
              hintText: 'https://... 또는 Google Drive 공유 링크',
              hintStyle: TextStyle(color: colors.muted),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: BorderSide(color: colors.lineStrong),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: BorderSide(color: colors.focus, width: 2),
              ),
            ),
            onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('취소'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: Text('삽입', style: TextStyle(color: colors.cobalt)),
            ),
          ],
        );
      },
    );
    if (url != null && url.isNotEmpty && mounted) {
      final imageUrl = toGoogleDriveImageUrl(url);
      final index = _controller.selection.baseOffset.clamp(
        0,
        _controller.document.length - 1,
      );
      _controller.document.insert(index, BlockEmbed.image(imageUrl));
    }
  }

  Future<void> _showVideoUrlDialog() async {
    final ctrl = TextEditingController();
    final url = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final colors = ctx.aublColors;
        return AlertDialog(
          backgroundColor: colors.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          title: Text(
            '동영상 URL 입력',
            style: TextStyle(
              color: colors.navyStrong,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: TextField(
            controller: ctrl,
            autofocus: true,
            style: TextStyle(color: colors.ink),
            decoration: InputDecoration(
              hintText: 'https://www.youtube.com/watch?v=...',
              hintStyle: TextStyle(color: colors.muted),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: BorderSide(color: colors.lineStrong),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: BorderSide(color: colors.focus, width: 2),
              ),
            ),
            onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('취소'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: Text('삽입', style: TextStyle(color: colors.cobalt)),
            ),
          ],
        );
      },
    );
    if (url != null && url.isNotEmpty && mounted) {
      final embedUrl = toYouTubeEmbedUrl(url);
      final index = _controller.selection.baseOffset.clamp(
        0,
        _controller.document.length - 1,
      );
      _controller.document.insert(index, BlockEmbed.video(embedUrl));
    }
  }

  Future<void> _showTableDialog() async {
    final tableData = await showAublTableEditorDialog(
      context: context,
      initialData: AublTableData.initial(),
      title: '표 삽입',
    );
    if (tableData == null || !mounted) return;
    var index = _controller.selection.baseOffset;
    if (index < 0) index = _controller.document.length - 1;
    _controller.replaceText(
      index,
      0,
      buildAublTableEmbeddable(tableData),
      TextSelection.collapsed(offset: index + 1),
    );
  }

  Future<void> _editTableEmbed(
    BuildContext dialogContext,
    EmbedContext embedContext,
    AublTableData tableData,
  ) async {
    final updated = await showAublTableEditorDialog(
      context: dialogContext,
      initialData: tableData,
      title: '표 편집',
    );
    if (updated == null || !mounted) return;
    final offset = embedContext.node.documentOffset;
    embedContext.controller.replaceText(
      offset,
      1,
      buildAublTableEmbeddable(updated),
      TextSelection.collapsed(offset: offset + 1),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final toolbarConfigs = widget.mini
        ? _miniToolbarConfigs
        : _fullToolbarConfigs;
    final toolbarIconTheme = QuillIconTheme(
      iconButtonUnselectedData: IconButtonData(
        color: colors.navy,
        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
        style: IconButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
      ),
      iconButtonSelectedData: IconButtonData(
        color: colors.cobalt,
        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
        style: IconButton.styleFrom(
          backgroundColor: colors.cobalt.withValues(alpha: 0.12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
      ),
    );

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: colors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ColoredBox(
            color: colors.surfaceMuted,
            child: QuillSimpleToolbar(
              controller: _controller,
              config: QuillSimpleToolbarConfig(
                buttonOptions: QuillSimpleToolbarButtonOptions(
                  base: QuillToolbarBaseButtonOptions(
                    iconTheme: toolbarIconTheme,
                  ),
                ),
                showDividers: false,
                showFontFamily: false,
                showFontSize: false,
                showBoldButton: toolbarConfigs.contains('bold'),
                showItalicButton: toolbarConfigs.contains('italic'),
                showUnderLineButton: toolbarConfigs.contains('underline'),
                showStrikeThrough: false,
                showInlineCode: false,
                showColorButton: false,
                showBackgroundColorButton: false,
                showClearFormat: !widget.mini,
                showAlignmentButtons: false,
                showLeftAlignment: false,
                showCenterAlignment: false,
                showRightAlignment: false,
                showJustifyAlignment: false,
                showHeaderStyle: false,
                showListNumbers: toolbarConfigs.contains('list'),
                showListBullets: toolbarConfigs.contains('list'),
                showListCheck: false,
                showCodeBlock: false,
                showQuote: false,
                showIndent: false,
                showLink: toolbarConfigs.contains('link'),
                showUndo: false,
                showRedo: false,
                showDirection: false,
                showSearchButton: false,
                showSubscript: false,
                showSuperscript: false,
                customButtons: widget.mini
                    ? []
                    : [
                        QuillToolbarCustomButtonOptions(
                          icon: const Icon(Icons.image_outlined, size: 20),
                          onPressed: _showImageUrlDialog,
                        ),
                        QuillToolbarCustomButtonOptions(
                          icon: const Icon(
                            Icons.video_library_outlined,
                            size: 20,
                          ),
                          onPressed: _showVideoUrlDialog,
                        ),
                        QuillToolbarCustomButtonOptions(
                          icon: const Icon(
                            Icons.table_chart_outlined,
                            size: 20,
                          ),
                          onPressed: _showTableDialog,
                        ),
                      ],
                iconTheme: toolbarIconTheme,
                decoration: BoxDecoration(
                  color: colors.surfaceMuted,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(4),
                    topRight: Radius.circular(4),
                  ),
                ),
              ),
            ),
          ),
          Divider(height: 1, color: colors.line),
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: widget.minHeight),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: QuillEditor.basic(
                controller: _controller,
                focusNode: _focusNode,
                config: QuillEditorConfig(
                  placeholder: widget.placeholder,
                  padding: EdgeInsets.zero,
                  autoFocus: false,
                  expands: false,
                  scrollable: true,
                  embedBuilders: [
                    _ImageEmbedBuilder(),
                    _VideoEmbedBuilder(),
                    AublTableEmbedBuilder(onEditRequested: _editTableEmbed),
                  ],
                  customStyles: DefaultStyles(
                    color: colors.ink,
                    placeHolder: DefaultTextBlockStyle(
                      TextStyle(color: colors.muted, fontSize: 14),
                      HorizontalSpacing.zero,
                      VerticalSpacing.zero,
                      VerticalSpacing.zero,
                      null,
                    ),
                    paragraph: DefaultTextBlockStyle(
                      TextStyle(color: colors.ink, fontSize: 15, height: 1.6),
                      HorizontalSpacing.zero,
                      VerticalSpacing.zero,
                      VerticalSpacing.zero,
                      null,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

const _fullToolbarConfigs = ['bold', 'italic', 'underline', 'list', 'link'];
const _miniToolbarConfigs = ['bold', 'italic', 'link'];

class _ImageEmbedBuilder extends EmbedBuilder {
  @override
  String get key => BlockEmbed.imageType;

  @override
  bool get expanded => false;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final url = embedContext.node.value.data as String;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => Icon(
            Icons.broken_image,
            color: context.aublColors.muted,
            size: 48,
          ),
        ),
      ),
    );
  }
}

class _VideoEmbedBuilder extends EmbedBuilder {
  @override
  String get key => BlockEmbed.videoType;

  @override
  bool get expanded => true;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final url = embedContext.node.value.data as String;
    final wc = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse(url));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: SizedBox(height: 220, child: WebViewWidget(controller: wc)),
      ),
    );
  }
}
