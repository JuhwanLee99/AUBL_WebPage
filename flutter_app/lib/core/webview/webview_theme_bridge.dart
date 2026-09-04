import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../theme/app_theme.dart';

class WebViewThemeBridge {
  const WebViewThemeBridge._();

  static String name(Brightness brightness) =>
      brightness == Brightness.dark ? 'dark' : 'light';

  static Color background(Brightness brightness) =>
      brightness == Brightness.dark
          ? AppTheme.darkColors.canvas
          : AppTheme.lightColors.canvas;

  static String script(Brightness brightness) {
    final theme = name(brightness);
    final themeColor = theme == 'dark' ? '#07142b' : '#ffffff';
    return '''
(() => {
  const theme = '$theme';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try { window.localStorage.setItem('aubl:theme:v1', theme); } catch (_) {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '$themeColor');
  window.dispatchEvent(new CustomEvent('aubl-native-theme', { detail: { theme } }));
})();
''';
  }

  static Future<void> sync(
    WebViewController controller,
    Brightness brightness,
  ) async {
    try {
      await controller.runJavaScript(script(brightness));
    } catch (_) {
      // The document may not be ready yet; onPageFinished retries the sync.
    }
  }
}
