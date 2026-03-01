import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'delta_utils.dart';

/// Delta JSON 또는 plain text를 렌더링하는 읽기 전용 뷰어
class RichTextViewer extends StatefulWidget {
  const RichTextViewer({
    super.key,
    required this.content,
    this.fontSize = 15.0,
    this.color = const Color(0xFFcbd5e1),
    this.lineHeight = 1.6,
  });

  final String content;
  final double fontSize;
  final Color color;
  final double lineHeight;

  @override
  State<RichTextViewer> createState() => _RichTextViewerState();
}

class _RichTextViewerState extends State<RichTextViewer> {
  late QuillController _controller;

  QuillController _buildViewerController(String content) {
    final controller = safeControllerFrom(content);
    controller.readOnly = true;
    return controller;
  }

  @override
  void initState() {
    super.initState();
    _controller = _buildViewerController(widget.content);
  }

  @override
  void didUpdateWidget(covariant RichTextViewer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.content != oldWidget.content) {
      _controller.dispose();
      _controller = _buildViewerController(widget.content);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // plain text는 Delta 없이 간단하게 렌더링
    if (!isJsonDelta(widget.content)) {
      return Text(
        widget.content,
        style: TextStyle(
          color: widget.color,
          fontSize: widget.fontSize,
          height: widget.lineHeight,
        ),
      );
    }

    return QuillEditor.basic(
      controller: _controller,
      config: QuillEditorConfig(
        padding: EdgeInsets.zero,
        autoFocus: false,
        expands: false,
        scrollable: false,
        showCursor: false,
        enableInteractiveSelection: false,
        enableSelectionToolbar: false,
        onLaunchUrl: (url) {
          unawaited(_launchExternal(url));
        },
        embedBuilders: [_ImageEmbedBuilder(), _VideoEmbedBuilder()],
        customStyles: DefaultStyles(
          color: widget.color,
          paragraph: DefaultTextBlockStyle(
            TextStyle(
                color: widget.color,
                fontSize: widget.fontSize,
                height: widget.lineHeight),
            HorizontalSpacing.zero,
            VerticalSpacing.zero,
            VerticalSpacing.zero,
            null,
          ),
        ),
      ),
    );
  }

  Future<void> _launchExternal(String rawUrl) async {
    final url = rawUrl.trim();
    if (url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

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
        borderRadius: BorderRadius.circular(8),
        child: CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => const Icon(Icons.broken_image,
              color: Color(0xFF64748b), size: 48),
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
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(height: 220, child: WebViewWidget(controller: wc)),
      ),
    );
  }
}
