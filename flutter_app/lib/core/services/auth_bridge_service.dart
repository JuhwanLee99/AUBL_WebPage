import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class AuthBridgeException implements Exception {
  AuthBridgeException(this.message);

  final String message;

  @override
  String toString() => message;
}

class AuthBridgeService {
  AuthBridgeService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<String> exchangeWebIdToken(String idToken) async {
    final uri = Uri.parse(AppConfig.authBridgeUrl);
    final response = await _client.post(
      uri,
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({'idToken': idToken}),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw AuthBridgeException(
        '토큰 교환 실패: HTTP ${response.statusCode} ${response.body}',
      );
    }

    final dynamic decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw AuthBridgeException('토큰 교환 응답 형식이 올바르지 않습니다.');
    }

    final token = decoded['customToken'];
    if (token is! String || token.isEmpty) {
      throw AuthBridgeException('customToken이 응답에 없습니다.');
    }

    return token;
  }

  void dispose() {
    _client.close();
  }
}
