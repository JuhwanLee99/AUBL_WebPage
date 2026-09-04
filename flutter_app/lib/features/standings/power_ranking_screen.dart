import 'package:flutter/material.dart';

import '../records/records_screen.dart';

/// Legacy route retained for deep links. No locally generated demo ranking is
/// shown; the records hub loads the published backend ranking instead.
class PowerRankingScreen extends StatelessWidget {
  const PowerRankingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const RecordsScreen(initialTab: RecordsHubTab.power);
  }
}
