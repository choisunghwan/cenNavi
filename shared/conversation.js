// Store plain text only: never persist screenshots, HTML or executable plans.
(function () {
  function create(key = 'screenGuide.conversation.v1') {
    let turns = [], saved = true;
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(value)) turns = value.filter(x => x && ['user', 'model'].includes(x.role) && typeof x.text === 'string').slice(-60).map(x => ({role:x.role,text:x.text.slice(0,12000)}));
    } catch { /* A damaged record starts a fresh session. */ }
    function persist() { try { localStorage.setItem(key, JSON.stringify(turns)); saved = true; } catch { saved = false; } }
    return {
      messages: () => turns.map(x => ({...x})),
      append(role, text) { if (!['user','model'].includes(role) || !String(text).trim()) return; turns.push({role,text:String(text).slice(0,12000)}); turns=turns.slice(-60); persist(); },
      clear() { turns=[]; persist(); },
      saved: () => saved,
    };
  }
  window.EnvConversation = { create };
})();
