import 'package:flutter/material.dart';

class BackgroundLogo extends StatelessWidget {
  const BackgroundLogo({
    super.key,
    this.verticalOffset = 0,
    this.saturation = 1.0,
  });

  static const double _logoOpacity = 0.5;
  static const double _logoWidth = 400;
  final double verticalOffset;
  final double saturation;

  static List<double> _saturationMatrix(double s) {
    final inv = 1 - s;
    final r = 0.213 * inv;
    final g = 0.715 * inv;
    final b = 0.072 * inv;
    return [
      r + s, g, b, 0, 0,
      r, g + s, b, 0, 0,
      r, g, b + s, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      'assets/images/aubl_clean.png',
      width: _logoWidth,
      fit: BoxFit.contain,
    );
    final filteredImage = saturation == 1.0
        ? image
        : ColorFiltered(
            colorFilter: ColorFilter.matrix(_saturationMatrix(saturation)),
            child: image,
          );

    return Center(
      child: Transform.translate(
        offset: Offset(0, verticalOffset),
        child: Opacity(
          opacity: _logoOpacity,
          child: filteredImage,
        ),
      ),
    );
  }
}
