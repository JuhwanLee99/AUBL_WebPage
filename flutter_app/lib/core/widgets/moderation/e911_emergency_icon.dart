import 'dart:math' as math;

import 'package:flutter/material.dart';

class E911EmergencyIcon extends StatelessWidget {
  const E911EmergencyIcon({
    super.key,
    this.size = 24,
    this.color = const Color(0xFFE3E3E3),
  });

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _E911EmergencyPainter(color: color),
      ),
    );
  }
}

class _E911EmergencyPainter extends CustomPainter {
  const _E911EmergencyPainter({required this.color});

  final Color color;

  static double _y(double raw) => raw + 960;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = math.min(size.width, size.height) / 960.0;
    final dx = (size.width - 960.0 * scale) / 2;
    final dy = (size.height - 960.0 * scale) / 2;

    canvas.save();
    canvas.translate(dx, dy);
    canvas.scale(scale, scale);

    final path = Path()
      ..moveTo(200, _y(-160))
      ..relativeLineTo(0, -80)
      ..relativeLineTo(64, 0)
      ..relativeLineTo(79, -263)
      ..relativeQuadraticBezierTo(8, -26, 29.5, -41.5)
      ..quadraticBezierTo(394, _y(-560), 420, _y(-560))
      ..relativeLineTo(120, 0)
      ..relativeQuadraticBezierTo(26, 0, 47.5, 15.5)
      ..quadraticBezierTo(609, _y(-529), 617, _y(-503))
      ..relativeLineTo(79, 263)
      ..relativeLineTo(64, 0)
      ..relativeLineTo(0, 80)
      ..lineTo(200, _y(-160))
      ..close()
      ..moveTo(348, _y(-240))
      ..relativeLineTo(264, 0)
      ..relativeLineTo(-72, -240)
      ..lineTo(420, _y(-480))
      ..relativeLineTo(-72, 240)
      ..close()
      ..moveTo(440, _y(-640))
      ..relativeLineTo(0, -200)
      ..relativeLineTo(80, 0)
      ..relativeLineTo(0, 200)
      ..lineTo(440, _y(-640))
      ..close()
      ..moveTo(678, _y(-541))
      ..relativeLineTo(-57, -57)
      ..relativeLineTo(142, -141)
      ..relativeLineTo(56, 56)
      ..relativeLineTo(-141, 142)
      ..close()
      ..moveTo(720, _y(-360))
      ..relativeLineTo(0, -80)
      ..relativeLineTo(200, 0)
      ..relativeLineTo(0, 80)
      ..lineTo(720, _y(-360))
      ..close()
      ..moveTo(282, _y(-541))
      ..lineTo(141, _y(-683))
      ..relativeLineTo(56, -56)
      ..relativeLineTo(142, 141)
      ..relativeLineTo(-57, 57)
      ..close()
      ..moveTo(40, _y(-360))
      ..relativeLineTo(0, -80)
      ..relativeLineTo(200, 0)
      ..relativeLineTo(0, 80)
      ..lineTo(40, _y(-360))
      ..close();

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill
      ..isAntiAlias = true;

    canvas.drawPath(path, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _E911EmergencyPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}
