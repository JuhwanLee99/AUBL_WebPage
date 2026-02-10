import 'package:flutter/material.dart';

class ShellController extends InheritedWidget {
  const ShellController({
    super.key,
    required this.openEmbeddedWebView,
    required this.closeEmbeddedWebView,
    required super.child,
  });

  final void Function(String path, String title) openEmbeddedWebView;
  final VoidCallback closeEmbeddedWebView;

  static ShellController? of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ShellController>();
  }

  @override
  bool updateShouldNotify(ShellController oldWidget) => false;
}
