import 'package:flutter/material.dart';

import '../core/navigation/app_destination.dart';

class ShellController extends InheritedWidget {
  const ShellController({
    super.key,
    required this.openEmbeddedWebView,
    required this.closeEmbeddedWebView,
    required this.switchTab,
    required this.refreshNotifier,
    required super.child,
  });

  final void Function(String path, String title, {bool fullscreen})
      openEmbeddedWebView;
  final VoidCallback closeEmbeddedWebView;
  final void Function(AppDestination destination, {int? recordsTabIndex})
      switchTab;

  /// 앱이 foreground로 복귀할 때 값이 증가하는 노티파이어.
  /// 각 화면에서 이 값을 listen하여 데이터를 갱신.
  final ValueNotifier<int> refreshNotifier;

  static ShellController? of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ShellController>();
  }

  @override
  bool updateShouldNotify(ShellController oldWidget) => false;
}
