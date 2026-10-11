/*
 * Kalkulačka – plovoucí okno, které zůstává otevřené i nad zámkem brány (dá se přesunout).
 * Počítá celé výrazy: + − × ÷, závorky, druhá mocnina (x²), desetinná čárka.
 * Výraz se vyhodnocuje vlastním jednoduchým rozborem (žádné eval).
 */
(function (global) {
  'use strict';

  const OPS = ['+', '−', '×', '÷'];

  /* Vyhodnocení výrazu, např. „50×0,3÷0,03“ → 500. Při chybě vyhodí výjimku. */
  function evaluate(text) {
    const s = text.replace(/\s+/g, '');
    let i = 0;
    const peek = () => s[i];
    const fail = () => { throw new Error('syntax'); };

    function number() {
      const m = /^(\d+(,\d*)?|,\d+)/.exec(s.slice(i));
      if (!m) fail();
      i += m[0].length;
      return parseFloat(m[0].replace(',', '.'));
    }
    function primary() {
      if (peek() === '(') {
        i++;
        const v = expr();
        if (peek() !== ')') fail();
        i++;
        return v;
      }
      return number();
    }
    function power() {
      let v = primary();
      while (peek() === '²') { i++; v *= v; }
      return v;
    }
    function unary() {
      if (peek() === '−') { i++; return -unary(); }
      return power();
    }
    function term() {
      let v = unary();
      while (peek() === '×' || peek() === '÷') {
        const op = s[i++];
        const r = unary();
        if (op === '×') v *= r;
        else {
          if (r === 0) throw new Error('div0');
          v /= r;
        }
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '−') {
        const op = s[i++];
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }

    const v = expr();
    if (i !== s.length) fail();
    if (!Number.isFinite(v)) throw new Error('range');
    return v;
  }

  /* Číslo pro displej: 10 platných číslic, desetinná čárka. */
  function format(v) {
    let r = Number(v.toPrecision(10));
    if (Object.is(r, -0)) r = 0;
    const a = Math.abs(r);
    if (a !== 0 && (a >= 1e12 || a < 1e-9)) return r.toExponential(5).replace('.', ',');
    return String(r).replace('.', ',');
  }

  /* Výraz pro displej s mezerami kolem operátorů. */
  function pretty(expr) {
    return expr.replace(/([+×÷])/g, ' $1 ').replace(/(\d|\)|²)−/g, '$1 − ');
  }

  class Calculator {
    constructor(options) {
      this.onKey = (options && options.onKey) || (() => {});
      this.lockTarget = null;  // funkce, která přenese výsledek do zámku (když je zámek otevřený)
      this.expr = '';
      this.last = '';
      this.result = null;
      this.done = false;       // poslední stisk bylo „=“
      this.el = null;
    }

    get isOpen() {
      return Boolean(this.el && !this.el.hidden);
    }

    build() {
      const el = document.createElement('div');
      el.className = 'calc';
      el.hidden = true;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Kalkulačka');

      const head = document.createElement('div');
      head.className = 'calc-head';
      const title = document.createElement('span');
      title.textContent = 'Kalkulačka';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'calc-close';
      close.setAttribute('aria-label', 'Zavřít kalkulačku');
      close.textContent = '×';
      close.addEventListener('click', () => this.close());
      head.append(title, close);

      const screen = document.createElement('div');
      screen.className = 'calc-screen';
      this.lastEl = document.createElement('div');
      this.lastEl.className = 'calc-last';
      this.mainEl = document.createElement('div');
      this.mainEl.className = 'calc-main';
      screen.append(this.lastEl, this.mainEl);

      const keys = document.createElement('div');
      keys.className = 'calc-keys';
      const layout = [
        ['C', 'fn'], ['⌫', 'fn'], ['(', 'fn'], [')', 'fn'],
        ['7'], ['8'], ['9'], ['÷', 'op'],
        ['4'], ['5'], ['6'], ['×', 'op'],
        ['1'], ['2'], ['3'], ['−', 'op'],
        ['0'], [','], ['x²', 'fn'], ['+', 'op'],
        ['=', 'eq'],
      ];
      for (const [label, kind] of layout) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.className = `calc-key${kind ? ' ' + kind : ''}`;
        b.setAttribute('aria-label', { '⌫': 'Smazat znak', 'C': 'Vymazat vše', 'x²': 'Druhá mocnina' }[label] || label);
        b.addEventListener('click', () => this.press(label));
        keys.appendChild(b);
      }

      this.transferBtn = document.createElement('button');
      this.transferBtn.type = 'button';
      this.transferBtn.className = 'calc-transfer';
      this.transferBtn.textContent = 'Přenést výsledek do zámku ›';
      this.transferBtn.addEventListener('click', () => this.transfer());

      el.append(head, screen, keys, this.transferBtn);
      document.body.appendChild(el);
      this.el = el;
      this.makeDraggable(head);
      this.render();
    }

    open() {
      if (!this.el) this.build();
      this.el.hidden = false;
      this.updateTransfer();
    }

    close() {
      if (this.el) this.el.hidden = true;
    }

    /* Zámek brány: fn(text) vloží číslo do zámku; null = zámek není otevřený. */
    setLockTarget(fn) {
      this.lockTarget = fn;
      this.updateTransfer();
    }

    /* Číslo, které by šlo přenést (výsledek, nebo samotné číslo na displeji). */
    transferValue() {
      if (this.done && this.result !== null) return format(this.result);
      if (/^\d+(,\d+)?$/.test(this.expr)) return this.expr;
      return null;
    }

    updateTransfer() {
      if (!this.transferBtn) return;
      this.transferBtn.hidden = !(this.lockTarget && this.transferValue() !== null);
    }

    transfer() {
      const v = this.transferValue();
      if (v !== null && this.lockTarget) this.lockTarget(v);
    }

    /* Zpracování tlačítka. */
    press(key) {
      this.onKey(key);
      const lastChar = this.expr.slice(-1);
      const afterValue = /[\d)²]/.test(lastChar);

      if (key === 'C') {
        this.expr = '';
        this.last = '';
        this.result = null;
        this.done = false;
      } else if (key === '⌫') {
        if (this.done) {
          this.done = false;
          this.last = '';
        } else {
          this.expr = this.expr.slice(0, -1);
        }
      } else if (key === '=') {
        this.calculate();
      } else if (/^\d$/.test(key) || key === ',') {
        if (this.done) this.startFresh();
        const lastNumber = (/(\d*,?\d*)$/.exec(this.expr) || [''])[0];
        if (key === ',' && lastNumber.includes(',')) return this.render();
        if (key === ',' && !/\d$/.test(this.expr)) this.append('0');
        if (/[)²]$/.test(this.expr)) this.append('×');
        this.append(key);
      } else if (OPS.includes(key)) {
        if (this.done) this.continueFromResult();
        if (this.expr === '' || this.expr.endsWith('(')) {
          if (key === '−') this.append('−');
        } else if (OPS.includes(lastChar)) {
          this.expr = this.expr.slice(0, -1) + key;
        } else if (lastChar !== ',') {
          this.append(key);
        }
      } else if (key === '(') {
        if (this.done) this.startFresh();
        if (afterValue) this.append('×');
        this.append('(');
      } else if (key === ')') {
        const open = (this.expr.match(/\(/g) || []).length;
        const closed = (this.expr.match(/\)/g) || []).length;
        if (open > closed && afterValue) this.append(')');
      } else if (key === 'x²') {
        if (this.done) this.continueFromResult();
        if (afterValue) this.append('²');
      }
      this.render();
    }

    append(text) {
      if (this.expr.length < 48) this.expr += text;
    }

    startFresh() {
      this.expr = '';
      this.done = false;
      this.result = null;
    }

    continueFromResult() {
      this.expr = this.result !== null ? format(this.result).replace(/^-/, '−') : '';
      this.done = false;
    }

    calculate() {
      if (!this.expr) return;
      // chybějící závorky na konci doplnit
      const open = (this.expr.match(/\(/g) || []).length;
      const closed = (this.expr.match(/\)/g) || []).length;
      const full = this.expr + ')'.repeat(Math.max(0, open - closed));
      try {
        this.result = evaluate(full);
        this.last = pretty(full) + ' =';
        this.expr = full;
        this.done = true;
      } catch (e) {
        this.last = e.message === 'div0' ? 'Nulou dělit nelze' : 'Chyba ve výrazu';
        this.result = null;
        this.done = false;
      }
    }

    render() {
      if (!this.el) return;
      this.lastEl.textContent = this.last ? '⁦' + this.last + '⁩' : '';
      const text = this.done && this.result !== null ? format(this.result) : (pretty(this.expr) || '0');
      // Dlouhý výraz menším písmem; začátek se případně skryje vlevo (konec zůstává vidět).
      this.mainEl.textContent = '⁦' + text + '⁩';
      this.mainEl.classList.toggle('long', text.length > 13 && text.length <= 20);
      this.mainEl.classList.toggle('xlong', text.length > 20);
      this.updateTransfer();
    }

    /* Přesouvání okna za horní lištu (myší i prstem). */
    makeDraggable(handle) {
      let start = null;
      handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        const r = this.el.getBoundingClientRect();
        start = { x: e.clientX - r.left, y: e.clientY - r.top };
        handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener('pointermove', (e) => {
        if (!start) return;
        const w = this.el.offsetWidth;
        const h = this.el.offsetHeight;
        const x = Math.min(Math.max(0, e.clientX - start.x), window.innerWidth - w);
        const y = Math.min(Math.max(0, e.clientY - start.y), window.innerHeight - h);
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.right = 'auto';
      });
      const stop = () => { start = null; };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
    }
  }

  global.Calculator = Calculator;
  global.Calculator.evaluate = evaluate;  // pro kontrolu výpočtů
})(window);
