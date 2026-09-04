enum MatchViewMode {
  list,
  calendar;

  String get label => switch (this) {
        list => '목록',
        calendar => '달력',
      };
}
