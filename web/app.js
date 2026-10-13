// 웹 껍데기: 현재 탭을 알 수 없으므로 /로그인 <주소> 로 사이트를 지정한다 (manual 모드)
EnvCore.bindCopy();
EnvChat.mount({ getUrl: async () => "", manual: true });
EnvChat.setStatus("");
