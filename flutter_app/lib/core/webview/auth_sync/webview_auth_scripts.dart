import '../../contracts/flutter_bridge_contract.dart';

class WebViewAuthScripts {
  const WebViewAuthScripts._();

  static const String probeWebIdToken = '''
(async () => {
  try {
    const getter = window.${FlutterBridgeContracts.getIdTokenFunction};
    const bridge = window.${FlutterBridgeContracts.channelName};
    if (!getter || !bridge) return;
    const token = await getter();
    if (token) {
      bridge.postMessage(JSON.stringify({
        ${FlutterBridgeContracts.typeKey}: '${FlutterBridgeContracts.tokenRefresh}',
        ${FlutterBridgeContracts.idTokenKey}: token
      }));
    }
  } catch (_) {}
})();
''';

  static String buildInjectCustomToken({
    required String customToken,
    String? redirectUrl,
  }) {
    final escapedToken =
        customToken.replaceAll(r'\', r'\\').replaceAll("'", r"\'");
    final escapedRedirect =
        redirectUrl?.replaceAll(r'\', r'\\').replaceAll("'", r"\'");
    final redirectExpr =
        escapedRedirect == null ? 'null' : "'$escapedRedirect'";

    return '''
(() => new Promise((resolve) => {
  const token = '$escapedToken';
  const redirect = $redirectExpr;
  const inject = () => {
    const fn = window.${FlutterBridgeContracts.authInjectFunction};
    if (!fn) return false;
    Promise.resolve(fn(token))
      .then(() => {
        if (redirect) {
          window.location.replace(redirect);
        }
        resolve(true);
      })
      .catch(() => resolve(false));
    return true;
  };

  if (inject()) return;

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (inject()) {
      clearInterval(timer);
      return;
    }
    if (tries >= 20) {
      clearInterval(timer);
      resolve(false);
    }
  }, 300);
}))()
''';
  }
}
