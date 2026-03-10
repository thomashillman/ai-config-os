function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeAddress(addr) {
  if (!addr) return '';
  if (addr === '::1') return '127.0.0.1';
  if (addr.startsWith('::ffff:')) return addr.slice(7);
  return addr;
}

export function isLoopbackAddress(addr) {
  const normalized = normalizeAddress(addr);
  return normalized === '127.0.0.1' || normalized === '::1';
}

export function createTunnelPolicy(env = process.env) {
  const trustedForwarders = new Set(parseCsv(env.TRUSTED_FORWARDER_IPS));
  const tunnelToken = env.TUNNEL_SHARED_TOKEN || '';
  const requireMtlsHeader = env.REQUIRE_TUNNEL_MTLS === '1';

  return {
    host: env.DASHBOARD_HOST || '127.0.0.1',
    isTunnelApproved(requestLike) {
      const remoteAddress = normalizeAddress(requestLike.remoteAddress || '');
      const headers = requestLike.headers || {};
      const trustedForwarder = trustedForwarders.has(remoteAddress);

      if (isLoopbackAddress(remoteAddress)) {
        return true;
      }

      const tokenHeader = headers['x-tunnel-token'];
      if (tunnelToken && tokenHeader === tunnelToken) {
        return true;
      }

      const forwardedFor = headers['x-forwarded-for'];
      const forwardedProto = headers['x-forwarded-proto'];
      if (trustedForwarder && forwardedFor && forwardedProto) {
        if (!requireMtlsHeader) return true;
        return headers['x-client-cert-verified'] === 'SUCCESS';
      }

      return false;
    },
  };
}

export function tunnelGuardMiddleware(policy) {
  return function tunnelGuard(req, res, next) {
    const approved = policy.isTunnelApproved({
      remoteAddress: req.socket?.remoteAddress,
      headers: {
        'x-forwarded-for': req.get('x-forwarded-for'),
        'x-forwarded-proto': req.get('x-forwarded-proto'),
        'x-tunnel-token': req.get('x-tunnel-token'),
        'x-client-cert-verified': req.get('x-client-cert-verified'),
      },
    });

    if (!approved) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Direct/public access denied. Use approved tunnel with token, trusted forwarding, or mTLS assertions.',
      });
      return;
    }

    next();
  };
}
