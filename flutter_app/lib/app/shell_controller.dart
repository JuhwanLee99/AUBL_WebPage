import 'package:flutter/material.dart';

class ShellController extends InheritedWidget {
  const ShellController({
    super.key,
    required this.openEmbeddedWebView,
    required this.closeEmbeddedWebView,
    required this.switchTab,
    required super.child,
  });

  final void Function(String path, String title, {bool fullscreen}) openEmbeddedWebView;
  final VoidCallback closeEmbeddedWebView;
  final void Function(int index) switchTab;

  static ShellController? of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ShellController>();
  }

  @override
  bool updateShouldNotify(ShellController oldWidget) => false;
}
