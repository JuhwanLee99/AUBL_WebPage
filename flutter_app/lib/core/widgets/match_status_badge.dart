import 'package:flutter/material.dart';

import 'season_components.dart';

class MatchStatusBadge extends StatelessWidget {
  const MatchStatusBadge({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = switch (status) {
      'inProgress' => ('LIVE', SeasonBadgeTone.danger),
      'completed' => ('종료', SeasonBadgeTone.muted),
      'canceled' => ('취소', SeasonBadgeTone.warning),
      'scheduled' => ('예정', SeasonBadgeTone.blue),
      _ => (status, SeasonBadgeTone.muted),
    };
    return SeasonStatusBadge(label: label, tone: tone);
  }
}
