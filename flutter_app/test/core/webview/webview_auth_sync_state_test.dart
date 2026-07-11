import 'package:aubl_flutter_app/core/webview/webview_auth_sync_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WebViewAuthSyncState', () {
    test('skips duplicate consumed web id token', () {
      final state = WebViewAuthSyncState();

      expect(state.shouldSkipConsumedWebIdToken('token-1'), isFalse);
      state.markConsumedWebIdToken('token-1');
      expect(state.shouldSkipConsumedWebIdToken('token-1'), isTrue);
      expect(state.shouldSkipConsumedWebIdToken('token-2'), isFalse);
    });

    test('allows reinjection after logout clear for same uid', () {
      final state = WebViewAuthSyncState();

      state.setInitialObservedUid('uid-1');
      expect(state.shouldSkipObservedUid('uid-1'), isTrue);

      state.clearObservedUid();
      expect(state.shouldSkipObservedUid('uid-1'), isFalse);
    });

    test('preserves next injection bypass rules with redirect', () {
      final state = WebViewAuthSyncState();
      state.markInjected(uid: 'uid-1', idToken: 'id-token-1');

      expect(
        state.shouldSkipInjection(uid: 'uid-1', idToken: 'id-token-1'),
        isTrue,
      );
      expect(
        state.shouldSkipInjection(
          uid: 'uid-1',
          idToken: 'id-token-1',
          redirectUrl: 'https://example.com/next',
        ),
        isFalse,
      );
    });
  });
}
