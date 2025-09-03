(function(){
  /* ====== CONFIG ====== */
  var ROWS=10, COLS=10;
  var JACKPOT_KEY='bb_jackpot_pot_v8';
  var JACKPOT_SEED=0;
  var JACKPOT_TAKE_START=0.05;   // 5% phí vào bàn
  var BIG_REWARD_RATE=0.20;
  var SMALL_RANGE=[1,3];
  var BIG_RANGE=[5,10];
  var COMBO_SCORE=100;
  var PLACE_SCORE=10;
  var MIN_BET=10000, STEP=5000;

  var POT_ADD_PER_LINE_RATE=0.02;
  var JP_BASE_PROB=0.15;
  var JP_BONUS_PER_CLEAR=0.02;
  var JP_PROB_CAP=0.45;

  /* ====== STATE ====== */
  var board=createEmptyBoard();
  var trayPieces=[];
  var dragging=null;
  var score=0, balance=0, bet=10000;
  var jackpotPot=Math.max(JACKPOT_SEED, parseInt(localStorage.getItem(JACKPOT_KEY)||JACKPOT_SEED,10));
  var playing=false;
  var jpBonusProb=0;

  // Wake Lock để giữ màn hình không tắt (nếu hỗ trợ & HTTPS)
  var wakeLock=null;

  /* ====== DOM ====== */
  var $board=document.getElementById('board');
  var $tray=document.getElementById('tray');
  var $bal=document.getElementById('bal');
  var $score=document.getElementById('score');
  var $bet=document.getElementById('bet');
  var $betLabel=document.getElementById('betLabel');
  var $startBal=document.getElementById('startBal');
  var $jackpot=document.getElementById('jackpot');
  var $toast=document.getElementById('toast');
  var $jpPop=document.getElementById('jackpotPop');
  var $jpText=document.getElementById('jpText');
  var $dec5=document.getElementById('dec5');
  var $inc5=document.getElementById('inc5');
  var $startBtn=document.getElementById('startBtn');

  var colors=['#22d3ee','#60a5fa','#a78bfa','#34d399','#f472b6','#f59e0b','#fb7185','#4ade80','#38bdf8','#f97316'];
  var gold='#fbbf24';

  /* ====== Utils ====== */
  function createEmptyBoard(){ var b=[],r,c; for(r=0;r<ROWS;r++){ b[r]=[]; for(c=0;c<COLS;c++) b[r][c]=null; } return b; }
  function fmtVND(n){ return (n||0).toLocaleString('vi-VN')+' ₫'; }
  function randInt(a,b){ return (Math.random()*(b-a+1)|0)+a; }
  function randOf(arr){ return arr[(Math.random()*arr.length)|0]; }
  function saveJackpot(){ localStorage.setItem(JACKPOT_KEY, String(Math.max(jackpotPot, JACKPOT_SEED))); }
  function toast(s){ $toast.textContent=s; $toast.classList.remove('show'); var _=$toast.offsetWidth; $toast.classList.add('show'); }
  function updateHud(){ $bal.textContent=fmtVND(balance); $score.textContent=String(score); $betLabel.textContent=fmtVND(bet); $jackpot.textContent=fmtVND(jackpotPot); }

  // format số có dấu chấm
  function onlyDigits(s){ return s.replace(/[^\d]/g,''); }
  function formatDots(s){ if(!s) return ''; var x=s.replace(/^0+/,''); if(x==='') x='0'; var out='',i=0,n=x.length; for(i=0;i<n;i++){ var pos=n-i; out+=x.charAt(i); if(pos>1 && pos%3===1) out+='.'; } return out; }
  function readVNNumber(el,fb){ var raw=onlyDigits(el.value||''); if(!raw) return fb||0; return parseInt(raw,10); }
  function setVNNumber(el,num){ el.value=formatDots(String(num)); }
  function hookFormat(el){
    el.addEventListener('input', function(){ el.value=formatDots(onlyDigits(el.value||'')); });
    el.addEventListener('blur', function(){ var n=parseInt(onlyDigits(el.value||'')||'0',10); el.value=formatDots(String(n)); });
  }
  hookFormat($bet); hookFormat($startBal);

  function snapBet(n){
    if(isNaN(n)||n<MIN_BET) n=MIN_BET;
    var mod=(n-MIN_BET)%STEP;
    if(mod!==0){ if(mod>=STEP/2) n+=(STEP-mod); else n-=mod; }
    return Math.max(MIN_BET,n);
  }
  function setBetControlsEnabled(en){
    $bet.disabled=!en; $dec5.disabled=!en; $inc5.disabled=!en;
  }
  function setStartBtnRunning(isRun){
    if(isRun){ $startBtn.classList.add('running'); $startBtn.textContent='Dừng cược'; }
    else{ $startBtn.classList.remove('running'); $startBtn.textContent='Bắt đầu'; }
  }

  /* ====== Layout: tính kích thước ô cho mobile dễ chạm ====== */
  function resizeBoard(){
    // Lấy chiều rộng khả dụng (card trái chiếm ~100% khi mobile)
    var appW = Math.min(window.innerWidth*0.96, 520); // trần 520px
    var cell = Math.max(30, Math.min(44, Math.floor((appW - 12*parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')||6)) / 10)));
    document.documentElement.style.setProperty('--cell', cell+'px');
  }
  window.addEventListener('resize', resizeBoard);
  resizeBoard();

  // Chặn menu chuột phải / long-press
  window.addEventListener('contextmenu', function(e){ e.preventDefault(); });

  /* ====== Wake Lock ====== */
  function tryWakeLock(){
    if('wakeLock' in navigator){
      navigator.wakeLock.request('screen').then(function(lock){
        wakeLock=lock;
        wakeLock.addEventListener('release', function(){ /* released */ });
      }).catch(function(){ /* ignore */ });
    }
  }
  function releaseWakeLock(){ if(wakeLock){ wakeLock.release().catch(function(){}); wakeLock=null; } }
  document.addEventListener('visibilitychange', function(){
    // iOS/Android có thể release khi tab ẩn, thử xin lại khi quay lại
    if(document.visibilityState==='visible' && playing && wakeLock==null){ tryWakeLock(); }
  });

  /* ====== Render ====== */
  function drawBoard(){
    if($board.children.length!==ROWS*COLS){
      $board.innerHTML=''; var i; for(i=0;i<ROWS*COLS;i++){ var d=document.createElement('div'); d.className='cell'; $board.appendChild(d); }
    }
    var cells=$board.children,r,c,idx,val,dot;
    for(r=0;r<ROWS;r++){
      for(c=0;c<COLS;c++){
        idx=r*COLS+c; val=board[r][c]; cells[idx].className='cell'; cells[idx].innerHTML='';
        if(val){ cells[idx].classList.add('fill'); dot=document.createElement('div'); dot.className='dot'; dot.style.setProperty('--c', val.color); cells[idx].appendChild(dot); }
      }
    }
  }

  var SHAPES=[
    [[1]], [[1,1]], [[1],[1]], [[1,1,1]], [[1],[1],[1]], [[1,1],[1,1]],
    [[1,1,1],[1,0,0]], [[1,1,1],[0,1,0]], [[1,0],[1,1]], [[0,1],[1,1]],
    [[1,1,0],[0,1,1]], [[1,1,1,1]]
  ];
  function matToBlocks(mat){ var h=mat.length,w=mat[0].length,blocks=[],y,x; for(y=0;y<h;y++) for(x=0;x<w;x++) if(mat[y][x]) blocks.push([x,y]); return {w:w,h:h,blocks:blocks}; }
  var PIECES=SHAPES.map(matToBlocks);

  function createPiece(isJP){
    var base=randOf(PIECES); var color=isJP?gold:randOf(colors);
    var cloned=[],i,b; for(i=0;i<base.blocks.length;i++){ b=base.blocks[i]; cloned.push([b[0],b[1]]); }
    return { w:base.w, h:base.h, blocks:cloned, color:color, isJackpot:!!isJP };
  }

  function refillTray(){
    trayPieces=[];
    var jpProb = JP_BASE_PROB + jpBonusProb; if(jpProb>JP_PROB_CAP) jpProb=JP_PROB_CAP;
    var jpIndex = Math.random()<jpProb ? (Math.random()*3|0) : -1;
    var i; for(i=0;i<3;i++){ trayPieces.push(createPiece(i===jpIndex)); }
  }

  function drawTray(){
    $tray.innerHTML='';
    var i; for(i=0;i<trayPieces.length;i++){
      (function(idx){
        var p=trayPieces[idx];
        var el=document.createElement('div');
        el.className='piece'+(p.isJackpot?' jp':'');
        el.style.gridTemplateColumns='repeat('+p.w+', calc(var(--cell) - 6px))';
        el.style.gridTemplateRows='repeat('+p.h+', calc(var(--cell) - 6px))';
        var y,x,cell; for(y=0;y<p.h;y++) for(x=0;x<p.w;x++){
          cell=document.createElement('div'); cell.style.visibility='hidden';
          cell.style.width='calc(var(--cell) - 6px)'; cell.style.height='calc(var(--cell) - 6px)';
          el.appendChild(cell);
        }
        var k,bx,by,dot; for(k=0;k<p.blocks.length;k++){ bx=p.blocks[k][0]; by=p.blocks[k][1]; var pos=by*p.w+bx; dot=document.createElement('div'); dot.className='pcell'; dot.style.setProperty('--c', p.color); el.children[pos].replaceWith(dot); }
        if(p.isJackpot){ var tag=document.createElement('div'); tag.className='tagJP'; tag.textContent='JP'; el.appendChild(tag); }
        attachDrag(el,p);
        $tray.appendChild(el);
      })(i);
    }
  }

  /* ====== Game logic ====== */
  function canPlace(piece,row,col){
    if(row<0||col<0||row+piece.h>ROWS||col+piece.w>COLS) return false;
    var i,dx,dy,r,c; for(i=0;i<piece.blocks.length;i++){ dx=piece.blocks[i][0]; dy=piece.blocks[i][1]; r=row+dy; c=col+dx; if(board[r][c]) return false; } return true;
  }

  function placePiece(piece,row,col){
    var i,dx,dy,r,c;
    for(i=0;i<piece.blocks.length;i++){ dx=piece.blocks[i][0]; dy=piece.blocks[i][1]; r=row+dy; c=col+dx; board[r][c]={color:piece.color}; }
    drawBoard();

    var cleared=clearLines();
    if(cleared>0){
      var big=Math.random()<BIG_REWARD_RATE;
      var range=big?BIG_RANGE:SMALL_RANGE;
      var perLine=randInt(range[0],range[1]);
      var payout=bet * perLine * cleared;
      balance+=payout;
      score+=PLACE_SCORE*piece.blocks.length + COMBO_SCORE*cleared;
      updateHud();
      toast((big?'Thưởng TO ':'Thưởng nhỏ ')+cleared+' line: +'+fmtVND(payout));

      if(piece.isJackpot){
        if(jackpotPot>0){
          var winJP=jackpotPot; jackpotPot=0; saveJackpot();
          balance+=winJP; jpBonusProb=0; updateHud(); showJackpot(winJP);
        }else{
          toast('Khối JP đã ghép nổ, nhưng hũ đang trống.');
        }
      }else{
        var addPot = Math.floor(bet * POT_ADD_PER_LINE_RATE * cleared);
        jackpotPot += addPot; saveJackpot(); updateHud();
        jpBonusProb = Math.min(JP_PROB_CAP-JP_BASE_PROB, jpBonusProb + JP_BONUS_PER_CLEAR);
      }
    }

    var newTray=[],j; for(j=0;j<trayPieces.length;j++){ if(trayPieces[j]!==piece) newTray.push(trayPieces[j]); }
    trayPieces=newTray; if(trayPieces.length===0){ refillTray(); } drawTray();

    if(!hasAnyMove()){ onGameOver(); }
  }

  function clearLines(){
    var fullRows=[],fullCols=[],r,c;
    for(r=0;r<ROWS;r++){ var okR=true; for(c=0;c<COLS;c++){ if(!board[r][c]){ okR=false; break; } } if(okR) fullRows.push(r); }
    for(c=0;c<COLS;c++){ var okC=true; for(r=0;r<ROWS;r++){ if(!board[r][c]){ okC=false; break; } } if(okC) fullCols.push(c); }
    if(fullRows.length||fullCols.length){
      flashLines(fullRows,fullCols);
      setTimeout(function(){
        var i; for(i=0;i<fullRows.length;i++){ var rr=fullRows[i], cc; for(cc=0;cc<COLS;cc++) board[rr][cc]=null; }
        for(i=0;i<fullCols.length;i++){ var c2=fullCols[i], rr2; for(rr2=0;rr2<ROWS;rr2++) board[rr2][c2]=null; }
        drawBoard();
      },120);
    }
    return fullRows.length+fullCols.length;
  }
  function flashLines(rows,cols){
    var cells=$board.children,i,c,r,idx;
    for(i=0;i<rows.length;i++){ r=rows[i]; for(c=0;c<COLS;c++){ idx=r*COLS+c; cells[idx].classList.add('clear-flash'); } }
    for(i=0;i<cols.length;i++){ c=cols[i]; for(r=0;r<ROWS;r++){ idx=r*COLS+c; cells[idx].classList.add('clear-flash'); } }
  }
  function hasAnyMove(){
    var p,r,c; for(p=0;p<trayPieces.length;p++){ var piece=trayPieces[p];
      for(r=0;r<ROWS;r++) for(c=0;c<COLS;c++) if(canPlace(piece,r,c)) return true;
    } return false;
  }

  /* ====== Drag & Ghost (tối ưu mobile) ====== */
  function attachDrag(el,piece){
    var dragEl=null, ghostCells=[],grab={x:0,y:0};
    var moveQueued=false, lastMove=null;

    function clearGhost(){ var cells=$board.children,i; for(i=0;i<ghostCells.length;i++){ var id=ghostCells[i]; if(cells[id]) cells[id].classList.remove('ghost-ok','ghost-bad'); } ghostCells=[]; }
    function setGhost(row,col,ok){ clearGhost(); var cells=$board.children,i,dx,dy,r,c,idx;
      for(i=0;i<piece.blocks.length;i++){ dx=piece.blocks[i][0]; dy=piece.blocks[i][1]; r=row+dy; c=col+dx;
        if(r>=0&&c>=0&&r<ROWS&&c<COLS){ idx=r*COLS+c; cells[idx].classList.add(ok?'ghost-ok':'ghost-bad'); ghostCells.push(idx); } } }

    function processMove(e){
      moveQueued=false;
      if(!dragEl) return;
      var brect=$board.getBoundingClientRect();
      var cell=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
      var gap=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap'));
      var step=cell+gap;
      var x=(e.clientX||0)-brect.left, y=(e.clientY||0)-brect.top;
      var col=Math.floor(x/step)-grab.x; var row=Math.floor(y/step)-grab.y;
      var ok=canPlace(piece,row,col);
      if(x>=0 && y>=0 && x<=brect.width && y<=brect.height) setGhost(row,col,ok); else clearGhost();
      dragging.candidate={row:row,col:col,ok:ok};
      dragEl.style.left=(e.clientX||0)+'px'; dragEl.style.top=(e.clientY||0)+'px';
    }

    function queueMove(e){
      lastMove=e;
      if(!moveQueued){
        moveQueued=true;
        requestAnimationFrame(function(){ processMove(lastMove); });
      }
    }

    function onDown(e){
      if(!playing){ toast('Bấm Bắt đầu để chơi!'); return; }
      e.preventDefault();  // chặn cuộn/zoom khi chạm
      var rect=el.getBoundingClientRect();
      var px=e.clientX-rect.left, py=e.clientY-rect.top;
      var inner=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'))-6;
      grab.x=Math.min(piece.w-1, Math.max(0, Math.floor(px/inner)));
      grab.y=Math.min(piece.h-1, Math.max(0, Math.floor(py/inner)));

      dragEl=el.cloneNode(true); dragEl.className+=' drag'; document.body.appendChild(dragEl);
      dragEl.style.width=rect.width+'px'; dragEl.style.height=rect.height+'px'; el.style.opacity=.35;

      dragging={piece:piece,srcEl:el,candidate:null};
      queueMove(e);
      window.addEventListener('pointermove', queueMove, {passive:false});
      window.addEventListener('pointerup', up, {once:true});
    }
    function up(){
      el.style.opacity=1; if(dragEl){ dragEl.remove(); dragEl=null; }
      var cand=dragging&&dragging.candidate?dragging.candidate:null; clearGhost();
      if(cand&&cand.ok){ placePiece(piece,cand.row,cand.col); el.remove(); }
      dragging=null; window.removeEventListener('pointermove', queueMove, {passive:false});
    }
    el.addEventListener('pointerdown', onDown, {passive:false});
  }

  /* ====== Jackpot popup ====== */
  function showJackpot(amount){
    $jpText.textContent='💥 NỔ HŨ! Bạn nhận '+fmtVND(amount)+' 💥';
    $jpPop.style.display='grid'; setTimeout(function(){ $jpPop.style.display='none'; }, 1500);
    toast('NỔ HŨ: +'+fmtVND(amount));
  }

  /* ====== Flow ====== */
  function startGame(){
    if(playing) return;
    bet=snapBet(readVNNumber($bet, MIN_BET)); setVNNumber($bet, bet);
    balance=readVNNumber($startBal, 100000); setVNNumber($startBal, balance);
    if(balance<bet){ toast('Không đủ số dư để vào bàn!'); return; }

    balance-=bet;
    var add=Math.floor(bet*JACKPOT_TAKE_START);
    jackpotPot+=add; saveJackpot();

    score=0; board=createEmptyBoard(); drawBoard();
    jpBonusProb=0; refillTray(); drawTray();
    playing=true; setBetControlsEnabled(false); setStartBtnRunning(true); updateHud();
    toast('Đã trừ phí vào bàn: '+fmtVND(bet));

    tryWakeLock(); // giữ màn hình sáng khi chơi
  }

  function stopGame(){
    if(!playing) return;
    playing=false;
    setBetControlsEnabled(true);
    setStartBtnRunning(false);
    board=createEmptyBoard(); drawBoard();
    trayPieces=[]; refillTray(); drawTray();
    toast('Đã dừng cược. Bạn có thể đổi tiền cược.');
    releaseWakeLock();
  }

  function onGameOver(){
    playing=false; toast('Hết chỗ để đặt cho tất cả khối. Game Over!');
    setBetControlsEnabled(true);
    setStartBtnRunning(false);
    releaseWakeLock();
  }

  // Event
  $startBtn.addEventListener('click', function(){ if(playing) stopGame(); else startGame(); });
  $dec5.addEventListener('click', function(){ if(playing) return; var n=snapBet(readVNNumber($bet, MIN_BET)-STEP); setVNNumber($bet,n); bet=n; updateHud(); });
  $inc5.addEventListener('click', function(){ if(playing) return; var n=snapBet(readVNNumber($bet, MIN_BET)+STEP); setVNNumber($bet,n); bet=n; updateHud(); });

  // init
  (function(){
    setVNNumber($bet, MIN_BET);
    drawBoard(); updateHud();
    refillTray(); drawTray();
  })();

})();
