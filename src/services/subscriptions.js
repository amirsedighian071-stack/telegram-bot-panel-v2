import {
  get,
  list,
  bytes64,
  assert,
  hash,
  constantEqual,
  b64,
  utf8,
  fetchLimited,
  publicHTTPS,
} from "./common.js";
import { getUser, getSettings } from "../kv.js";
import { membershipGate } from "../gate.js";
import { resolveToken } from "../bot-api.js";
export async function subscription(request, env) {
  try {
    assert(request.method === "GET", "method_not_allowed", 405);
    const url = new URL(request.url),
      token = url.pathname.split("/")[2];
    assert(/^[a-f0-9]{64}$/.test(token || ""), "subscription_not_found", 404);
    const sid = await get(env, "sub", await hash(token)),
      s = sid ? await get(env, "service", sid) : null;
    assert(
      s &&
        constantEqual(s.ownerToken, token) &&
        !["disabled", "deleted", "refunded", "moving"].includes(s.status),
      "subscription_unavailable",
      404,
    );
    const user = await getUser(env, s.userId);
    assert(user && !user.banned, "subscription_unavailable", 403);
    const gate = await membershipGate(
      env,
      await resolveToken(env),
      user,
      await getSettings(env),
    );
    assert(gate.ok, "membership_required", 403);
    let content = (s.configs || []).join("\n");
    if (!content && s.subscriptionUrl) {
      const target = new URL(s.subscriptionUrl);
      assert(
        !target.username &&
          !target.password &&
          publicHTTPS(target.origin + target.pathname),
        "invalid_subscription_origin",
      );
      const res = await fetchLimited(target.href, {
        method: "GET",
        headers: { accept: "text/plain" },
      });
      assert(res.ok, "subscription_provider_unavailable", 502);
      content = res.text;
    }
    assert(content, "subscription_content_unavailable", 503);
    const raw =
      url.searchParams.get("format") === "raw" ||
      content.startsWith("[Interface]");
    const looksConfig =
      /^(vless|vmess|trojan|ss|ssr|hysteria2?|hy2|tuic):\/\//m.test(content);
    const body = raw ? content : looksConfig ? b64(utf8(content)) : content;
    return new Response(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "subscription-userinfo": `upload=0; download=${Math.floor(s.usedBytes || 0)}; total=${Math.floor(s.dataLimit || 0)}; expire=${Math.floor(s.expiresAt || 0)}`,
        "profile-update-interval": "6",
        "content-disposition": `inline; filename="${s.username}.${raw ? "conf" : "txt"}"`,
      },
    });
  } catch (e) {
    return new Response(e.message, {
      status: e.status || 400,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
}

export async function combinedSubscription(request, env) {
  try {
    const token = new URL(request.url).pathname.split("/")[2];
    assert(
      request.method === "GET" && /^[a-f0-9]{64}$/.test(token || ""),
      "subscription_not_found",
      404,
    );
    const binding = await get(env, "sub-all", await hash(token));
    assert(
      binding && constantEqual(binding.token, token),
      "subscription_not_found",
      404,
    );
    const user = await getUser(env, binding.userId);
    assert(user && !user.banned, "subscription_unavailable", 403);
    const gate = await membershipGate(
      env,
      await resolveToken(env),
      user,
      await getSettings(env),
    );
    assert(gate.ok, "membership_required", 403);
    const services = (await list(env, "service")).filter(
      (s) =>
        s.userId === binding.userId &&
        !["disabled", "refunded", "deleted", "expired"].includes(s.status) &&
        (!s.expiresAt || s.expiresAt > Date.now() / 1000),
    );
    assert(
      services.filter((s) => !s.configs?.length && s.subscriptionUrl).length <=
        20,
      "subscription_remote_limit",
      413,
    );
    const lists = await Promise.all(
      services.map(async (s) => {
        if (s.configs?.length) return s.configs;
        if (!s.subscriptionUrl) return [];
        const u = new URL(s.subscriptionUrl);
        assert(
          !u.username && !u.password && publicHTTPS(u.origin + u.pathname),
          "invalid_subscription_origin",
        );
        const r = await fetchLimited(u.href, {
          method: "GET",
          headers: { accept: "text/plain" },
        });
        assert(r.ok, "subscription_provider_unavailable", 502);
        let text = r.text;
        try {
          if (!/:\/\//.test(text))
            text = new TextDecoder().decode(bytes64(text.trim()));
        } catch {}
        return text.split(/\r?\n/);
      }),
    );
    const configs = [
      ...new Set(
        lists
          .flat()
          .filter((s) =>
            /^(vless|vmess|trojan|ss|ssr|hysteria2?|hy2|tuic):\/\//.test(s),
          )
          .map((s) => s.trim()),
      ),
    ];
    assert(configs.length, "compatible_configs_unavailable", 404);
    return new Response(b64(utf8(configs.join("\n"))), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
        "profile-update-interval": "6",
      },
    });
  } catch (e) {
    return new Response(e.message, {
      status: e.status || 400,
      headers: { "cache-control": "no-store" },
    });
  }
}
