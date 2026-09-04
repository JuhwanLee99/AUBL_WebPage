import 'package:flutter/material.dart';

import '../records/records_screen.dart';

/// Legacy route retained for deep links. The published API-backed standings
/// now live in the unified records hub.
class StandingsScreen extends StatelessWidget {
  const StandingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const RecordsScreen(initialTab: RecordsHubTab.standings);
  }
}
