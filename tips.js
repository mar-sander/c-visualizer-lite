/* L-TIPS1: 学習支援メニュー。解析エンジン・エディタ状態には干渉しません。 */
(() => {
  'use strict';

  const trigger = document.getElementById('tips-open');
  const menu = document.getElementById('tips-menu');
  const menuItems = document.getElementById('tips-menu-items');
  const dialog = document.getElementById('tips-dialog');
  const video = document.getElementById('tips-video');
  const closeButton = document.getElementById('tips-dialog-close');
  if (!trigger || !menu || !menuItems || !dialog || !video || !closeButton) return;

  // 項目を追加する際は、このデータだけ増やして表示先の処理を登録します。
  const topics = [
    { id: 'for-video', label: 'forループの動きを動画で見る', kind: 'video',
      src: 'assets/for_loop_value_trace_4x3_v2.mp4' },
    { id: 'nested-for-video', label: 'for二重ループを動画で見る', kind: 'video',
      src: 'assets/for_nested_loop_3x3_visual_trace_v3_fixed.mp4' },
    { id: 'while-video', label: 'whileループの動きを動画で見る', kind: 'video',
      src: 'assets/while_loop_value_trace_4x3_v1.mp4' },
    { id: 'array-max-video', label: '配列の最大値探索を動画で見る', kind: 'video',
      src: 'assets/array_max_value_trace_4x3_v1.mp4' },
    { id: 'array-sort-hint-video', label: '配列ソートのヒント動画を見る', kind: 'video',
      src: 'assets/array_sort_hint_video_v2.mp4' }
  ];

  const closeMenu = (restoreFocus = false) => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };

  const openMenu = () => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  };

  const openVideo = (topic) => {
    closeMenu();
    document.getElementById('tips-dialog-title').textContent = topic.label;
    const source = video.querySelector('source');
    if (source.getAttribute('src') !== topic.src) {
      source.setAttribute('src', topic.src);
      video.load();
    }
    dialog.showModal();
    closeButton.focus();
  };

  const closeVideo = () => {
    video.pause();
    try { video.currentTime = 0; } catch (_error) { /* 未読込時 */ }
    if (dialog.open) dialog.close();
  };

  // 動画を閉じるときは、音の有無によらず必ず再生を止めます。
  dialog.addEventListener('close', () => {
    video.pause();
    try { video.currentTime = 0; } catch (_error) { /* 未読込時は巻き戻し不要 */ }
    if (document.fullscreenElement && dialog.contains(document.fullscreenElement)) {
      document.exitFullscreen().catch(() => {});
    }
    trigger.focus();
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeVideo(); });
  closeButton.addEventListener('click', closeVideo);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) closeVideo();
  });

  const handlers = {
    video: openVideo
  };
  for (const topic of topics) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tips-menu-item';
    item.textContent = topic.label;
    item.dataset.topic = topic.id;
    item.addEventListener('click', () => handlers[topic.kind]?.(topic));
    menuItems.append(item);
  }

  trigger.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !event.target.closest('#tips-control')) closeMenu();
  });
  document.getElementById('tips-control').addEventListener('focusout', (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu(true);
      event.preventDefault();
    }
  });
})();
