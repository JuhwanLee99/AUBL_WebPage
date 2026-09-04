import 'package:aubl_flutter_app/core/webview/webview_theme_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('native theme bridge emits the supported web theme contract', () {
    expect(WebViewThemeBridge.name(Brightness.light), 'light');
    expect(WebViewThemeBridge.name(Brightness.dark), 'dark');
    expect(
      WebViewThemeBridge.script(Brightness.dark),
      allOf(
        contains("const theme = 'dark'"),
        contains('aubl:theme:v1'),
        contains('aubl-native-theme'),
      ),
    );
  });
}
