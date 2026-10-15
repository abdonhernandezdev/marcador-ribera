/* Real-time link between control.html and marcador.html.
   The control publishes the whole match state as a *retained* MQTT message, so a
   scoreboard that (re)connects gets the latest score straight away. Three free public
   brokers are used in parallel: if one is down, the others keep the score flowing.
   ?broker=ws://... overrides the list (used for local tests). */
(function (root) {
  'use strict';

  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];
  const DEFAULT_CHANNEL = 'rb-5j1nv9dn4o';

  function params() {
    return new URLSearchParams(location.search);
  }

  function channel() {
    const c = (params().get('canal') || DEFAULT_CHANNEL).toLowerCase().replace(/[^a-z0-9-]/g, '');
    return c || DEFAULT_CHANNEL;
  }

  function topic() {
    return 'adribera/marcador/v1/' + channel();
  }

  function brokerUrls() {
    const custom = params().getAll('broker');
    return custom.length ? custom : BROKERS;
  }

  function label(url) {
    if (url.includes('emqx')) return 'EMQX';
    if (url.includes('hivemq')) return 'HiveMQ';
    if (url.includes('mosquitto')) return 'Mosquitto';
    return url.replace(/^wss?:\/\//, '').split('/')[0];
  }

  /* connect({onState(state), onStatus([{name, ok}]), onConnect(name)}) -> {publish(state), status()} */
  function connect(opts) {
    const topicName = topic();
    const links = brokerUrls().map((url) => ({ url, name: label(url), ok: false, client: null }));

    function report() {
      if (opts.onStatus) opts.onStatus(links.map((l) => ({ name: l.name, ok: l.ok })));
    }

    links.forEach((link) => {
      const client = root.mqtt.connect(link.url, {
        clientId: 'rb_' + Math.random().toString(36).slice(2, 10),
        keepalive: 20,
        reconnectPeriod: 2000,
        connectTimeout: 8000,
        clean: true,
        protocolVersion: 4,
      });
      link.client = client;
      client.on('connect', () => {
        link.ok = true;
        client.subscribe(topicName, { qos: 1 });
        report();
        if (opts.onConnect) opts.onConnect(link.name);
      });
      ['close', 'offline', 'error', 'end'].forEach((ev) =>
        client.on(ev, () => {
          if (link.ok) {
            link.ok = false;
            report();
          }
        })
      );
      client.on('message', (_t, payload) => {
        let state = null;
        try {
          state = root.Rules.sanitize(JSON.parse(payload.toString()));
        } catch (e) {
          /* ignore malformed messages */
        }
        if (state) opts.onState(state, link.name);
      });
    });
    report();

    return {
      publish(state) {
        const msg = JSON.stringify(state);
        links.forEach((l) => {
          if (l.client && l.client.connected) l.client.publish(topicName, msg, { qos: 1, retain: true });
        });
      },
      status() {
        return links.map((l) => ({ name: l.name, ok: l.ok }));
      },
    };
  }

  root.Sync = { connect, channel, topic, DEFAULT_CHANNEL };
})(window);
