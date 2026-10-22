// 화면이 처음 열릴 때 서버 기능(AI·프록시)이 켜져 있는지 알려 줍니다. 비밀값은 내보내지 않습니다.
export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    ai: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ACCESS_CODE),
    proxy: true,
    needsCode: Boolean(process.env.ACCESS_CODE),
  });
}
