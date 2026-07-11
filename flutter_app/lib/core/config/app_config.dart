class AppConfig {
  const AppConfig._();

  static const String environment =
      String.fromEnvironment('AUBL_ENV', defaultValue: 'dev');

  static const String webBaseUrl = String.fromEnvironment(
    'AUBL_WEB_BASE_URL',
    defaultValue: 'https://aubl.club',
  );

  static const String backendApiUrl = String.fromEnvironment(
    'AUBL_BACKEND_API_URL',
    defaultValue: 'https://api.aubl.club',
  );

  static const String authBridgeUrl = String.fromEnvironment(
    'AUBL_AUTH_BRIDGE_URL',
    defaultValue:
        'https://asia-northeast3-aubl-backup.cloudfunctions.net/exchange_web_id_token',
  );

  static const String accountDeletionUrl = String.fromEnvironment(
    'AUBL_ACCOUNT_DELETION_URL',
    defaultValue: 'https://aubl.club/account-deletion',
  );

  static Uri webUri(
    String path, {
    Map<String, String>? queryParameters,
  }) {
    final base = Uri.parse(webBaseUrl);
    final normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    final resolved = base.resolve(normalizedPath);

    if (queryParameters == null || queryParameters.isEmpty) {
      return resolved;
    }

    return resolved.replace(
      queryParameters: {
        ...resolved.queryParameters,
        ...queryParameters,
      },
    );
  }
}
