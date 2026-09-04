class ApiCacheEnvelope<T> {
  const ApiCacheEnvelope({
    required this.schemaVersion,
    required this.cachedAt,
    required this.revision,
    required this.data,
  });

  static const currentSchemaVersion = 1;

  final int schemaVersion;
  final DateTime cachedAt;
  final String? revision;
  final T data;

  Map<String, dynamic> toJson(Object? Function(T value) encode) => {
        'schemaVersion': schemaVersion,
        'cachedAt': cachedAt.toUtc().toIso8601String(),
        'revision': revision,
        'data': encode(data),
      };

  static ApiCacheEnvelope<T>? tryParse<T>(
    dynamic value,
    T Function(dynamic value) decode,
  ) {
    if (value is! Map<String, dynamic>) return null;
    final version = value['schemaVersion'];
    final cachedAt = DateTime.tryParse(value['cachedAt']?.toString() ?? '');
    if (version != currentSchemaVersion || cachedAt == null) return null;
    try {
      return ApiCacheEnvelope<T>(
        schemaVersion: version as int,
        cachedAt: cachedAt,
        revision: value['revision']?.toString(),
        data: decode(value['data']),
      );
    } catch (_) {
      return null;
    }
  }
}

class ApiLoadResult<T> {
  const ApiLoadResult({
    required this.data,
    required this.fromCache,
    required this.cachedAt,
    required this.revision,
  });

  final T data;
  final bool fromCache;
  final DateTime? cachedAt;
  final String? revision;
}
