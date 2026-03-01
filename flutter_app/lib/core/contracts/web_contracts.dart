class WebRouteContracts {
  const WebRouteContracts._();

  static const String login = '/login';
  static const String scorekeeper = '/scorekeeper';
  static const String scoreboard = '/scoreboard';
  static const String admin = '/admin';
  static const String adminGames = '/admin/games';
  static const String scheduleManage = '/schedule/manage';

  static const String scoreboardTextPrefix = '/scoreboard-text/';
  static const String liveOverlayPrefix = '/live-overlay/';

  static String scoreboardText(String matchId) =>
      '$scoreboardTextPrefix$matchId';
  static String liveOverlay(String matchId) => '$liveOverlayPrefix$matchId';
}

class WebQueryContracts {
  const WebQueryContracts._();

  static const String embedded = 'embedded';
  static const String embeddedFlutter = 'flutter';
  static const String nativeGoogle = 'nativeGoogle';
  static const String next = 'next';
  static const String forceLogout = 'forceLogout';
  static const String enabled = '1';

  static Map<String, String> embeddedParams({
    String? nextPath,
    bool includeNativeGoogle = true,
    bool includeForceLogout = false,
  }) {
    final query = <String, String>{
      embedded: embeddedFlutter,
    };
    if (includeNativeGoogle) {
      query[nativeGoogle] = enabled;
    }
    if (includeForceLogout) {
      query[forceLogout] = enabled;
    }
    if (nextPath != null && nextPath.startsWith('/')) {
      query[next] = nextPath;
    }
    return query;
  }
}
