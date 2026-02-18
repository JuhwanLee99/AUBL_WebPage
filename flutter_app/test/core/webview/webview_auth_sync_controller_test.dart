import 'dart:convert';

import 'package:aubl_flutter_app/core/contracts/flutter_bridge_contract.dart';
import 'package:aubl_flutter_app/core/webview/webview_auth_sync_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WebViewAuthSyncController.handleBridgeMessage', () {
    test('routes login success payload to onWebToken', () async {
      String? capturedToken;
      var logoutCalled = false;
      var nativeGoogleCalled = false;

      await WebViewAuthSyncController.handleBridgeMessage(
        rawMessage: jsonEncode({
          FlutterBridgeContracts.typeKey: FlutterBridgeContracts.loginSuccess,
          FlutterBridgeContracts.idTokenKey: 'abc',
        }),
        onWebToken: (token) async {
          capturedToken = token;
        },
        onLogout: () async {
          logoutCalled = true;
        },
        onRequestNativeGoogle: () async {
          nativeGoogleCalled = true;
        },
      );

      expect(capturedToken, 'abc');
      expect(logoutCalled, isFalse);
      expect(nativeGoogleCalled, isFalse);
    });

    test('routes token refresh legacy token payload to onWebToken', () async {
      String? capturedToken;

      await WebViewAuthSyncController.handleBridgeMessage(
        rawMessage: jsonEncode({
          FlutterBridgeContracts.typeKey: FlutterBridgeContracts.tokenRefresh,
          FlutterBridgeContracts.legacyTokenKey: 'legacy-token',
        }),
        onWebToken: (token) async {
          capturedToken = token;
        },
        onLogout: () async {},
        onRequestNativeGoogle: () async {},
      );

      expect(capturedToken, 'legacy-token');
    });

    test('routes logout payload to onLogout', () async {
      var logoutCalled = false;

      await WebViewAuthSyncController.handleBridgeMessage(
        rawMessage: jsonEncode({
          FlutterBridgeContracts.typeKey: FlutterBridgeContracts.logout,
        }),
        onWebToken: (_) async {},
        onLogout: () async {
          logoutCalled = true;
        },
        onRequestNativeGoogle: () async {},
      );

      expect(logoutCalled, isTrue);
    });

    test('routes request native google payload', () async {
      var nativeGoogleCalled = false;

      await WebViewAuthSyncController.handleBridgeMessage(
        rawMessage: jsonEncode({
          FlutterBridgeContracts.typeKey:
              FlutterBridgeContracts.requestNativeGoogle,
        }),
        onWebToken: (_) async {},
        onLogout: () async {},
        onRequestNativeGoogle: () async {
          nativeGoogleCalled = true;
        },
      );

      expect(nativeGoogleCalled, isTrue);
    });

    test('ignores unknown payload', () async {
      var invoked = false;

      await WebViewAuthSyncController.handleBridgeMessage(
        rawMessage: jsonEncode({
          FlutterBridgeContracts.typeKey: 'SOMETHING_ELSE',
        }),
        onWebToken: (_) async {
          invoked = true;
        },
        onLogout: () async {
          invoked = true;
        },
        onRequestNativeGoogle: () async {
          invoked = true;
        },
      );

      expect(invoked, isFalse);
    });
  });
}
