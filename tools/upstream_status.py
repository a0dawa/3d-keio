#!/usr/bin/env python3
"""3d-keio の進歩(reference/porting/features.json)を、ほかのモデルのリポジトリへ移すための状況表。検証ではない。

  python3 -I tools/upstream_status.py check                 目録そのものの検査(京王の側。id の重複・since のコミット・detect が京王にある)
  python3 -I tools/upstream_status.py status <repo> [--keio <3d-keio の作業コピー>] [--all]
                                                           <repo> の取り込み状況(自動検出+ UPSTREAM.json の手書き)と、次に移せる機能
  python3 -I tools/upstream_status.py init <repo> [--keio <3d-keio>]
                                                           <repo>/UPSTREAM.json の雛形を作る(監査日・京王のコミットを記す)

取り込み済みの判定:features.json の detect(文字列)が <repo> の html・js・py・sh・md のどこかにあり、files のファイルがあれば取り込み済み。
一部だけなら一部。どちらも無ければ未。detect も files も無い項目は手書き(UPSTREAM.json の overrides)だけで決める。
overrides は自動検出より優先(n/a=この線区には要らない・adopted/partial/todo と note)。
"""
import json, os, subprocess, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
KEIO = os.path.dirname(HERE)
EXT = ('.html', '.js', '.py', '.sh', '.md', '.json')
SKIP_DIRS = {'.git', 'node_modules', 'dist', 'out', '__pycache__', '.venv'}
MAX_BYTES = 6_000_000


def load_features(keio):
    with open(os.path.join(keio, 'reference', 'porting', 'features.json'), encoding='utf-8') as f:
        return json.load(f)['features']


def scan(repo):
    """repo の中の文字列を引く索引。大きなデータは読まない"""
    texts, files = [], set()
    for root, ds, fs in os.walk(repo):
        ds[:] = [d for d in ds if d not in SKIP_DIRS]
        for n in fs:
            p = os.path.join(root, n)
            files.add(os.path.relpath(p, repo).replace(os.sep, '/'))
            if not n.endswith(EXT):
                continue
            try:
                if os.path.getsize(p) > MAX_BYTES:
                    continue
                with open(p, encoding='utf-8', errors='ignore') as f:
                    texts.append(f.read())
            except OSError:
                pass
    return '\n'.join(texts), files


def detect(feat, blob, files):
    pats, fl = feat.get('detect', []), feat.get('files', [])
    if not pats and not fl:
        return 'manual'
    got = [p in blob for p in pats] + [f in files for f in fl]
    if all(got):
        return 'adopted'
    return 'partial' if any(got) else 'missing'


def git(keio, *a):
    try:
        return subprocess.run(['git', '-C', keio, *a], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return ''


def cmd_check(keio):
    feats = load_features(keio)
    blob, files = scan(keio)
    ids, ng = set(), 0
    for f in feats:
        if f['id'] in ids:
            print('NG 重複した id:', f['id']); ng += 1
        ids.add(f['id'])
        for k in ('title', 'kind', 'portable', 'since', 'date'):
            if k not in f:
                print('NG', f['id'], 'に', k, 'が無い'); ng += 1
        if f.get('portable') not in ('A', 'B', 'C'):
            print('NG', f['id'], 'の portable は A/B/C'); ng += 1
        if f['since'] and not git(keio, 'cat-file', '-t', f['since']):
            print('NG', f['id'], 'の since が履歴に無い(履歴を書き換えたら直す):', f['since']); ng += 1
        for p in f.get('detect', []):
            if p not in blob:
                print('NG', f['id'], 'の detect が京王に無い:', p); ng += 1
        for p in f.get('files', []):
            if p not in files:
                print('NG', f['id'], 'の files が京王に無い:', p); ng += 1
        for n in f.get('needs', []):
            if n not in {x['id'] for x in feats}:
                print('NG', f['id'], 'の needs が目録に無い:', n); ng += 1
    print('機能 %d 件・NG %d 件' % (len(feats), ng))
    return 1 if ng else 0


def status_of(feats, repo):
    blob, files = scan(repo)
    ov = {}
    up = os.path.join(repo, 'UPSTREAM.json')
    meta = {}
    if os.path.exists(up):
        with open(up, encoding='utf-8') as f:
            meta = json.load(f)
        ov = meta.get('overrides', {})
    st = {}
    for f in feats:
        auto = detect(f, blob, files)
        o = ov.get(f['id'])
        st[f['id']] = (o['status'], o.get('note', ''), auto) if o and 'status' in o else (auto, '', auto)
    return st, meta


def cmd_status(keio, repo, show_all):
    feats = load_features(keio)
    st, meta = status_of(feats, repo)
    mark = {'adopted': '済', 'partial': '一部', 'missing': '未', 'manual': '手書き', 'n/a': '不要', 'todo': '未'}
    cnt = {}
    for f in feats:
        if f['portable'] == 'C':
            continue
        s = st[f['id']][0]
        cnt[s] = cnt.get(s, 0) + 1
    print('取り込み先:', repo)
    if meta:
        print('監査:', meta.get('audited', '?'), '/ 京王のコミット:', meta.get('keio_commit', '?'))
    print('集計(京王専用を除く):', ' '.join('%s=%d' % (mark.get(k, k), v) for k, v in sorted(cnt.items())))
    print()
    done = {i for i, (s, _, _) in st.items() if s in ('adopted', 'n/a')}
    print('%-22s %-4s %-3s %s' % ('id', '状況', '移', 'タイトル'))
    for f in feats:
        if f['portable'] == 'C' and not show_all:
            continue
        s, note, auto = st[f['id']]
        if s in ('adopted', 'n/a') and not show_all:
            continue
        needs = [n for n in f.get('needs', []) if n not in done]
        extra = (' ← 先に ' + ','.join(needs)) if needs and s not in ('adopted', 'n/a') else ''
        print('%-22s %-4s %-3s %s%s%s' % (f['id'], mark.get(s, s), f['portable'], f['title'], extra, ('  [' + note + ']') if note else ''))
    print()
    nxt = [f for f in feats if f['portable'] != 'C' and st[f['id']][0] in ('missing', 'partial', 'todo')
           and all(n in done for n in f.get('needs', []))]
    nxt.sort(key=lambda f: (f['portable'] != 'A', f['date']))
    print('次に移せる機能(先に要る物が済んでいる。A=そのまま を先に、古い順):')
    for f in nxt[:12]:
        print('  - %s (%s)  検証 %s  京王の CLAUDE.md の節『%s』' % (f['id'], f['portable'], ' '.join(f.get('verify', [])) or '-', f.get('doc', '')))
    if not nxt:
        print('  (なし)')
    # 京王の目録に追加された物(監査の後)
    aud = meta.get('audited')
    if aud:
        new = [f['id'] for f in feats if f['date'] > aud]
        if new:
            print('\n監査(%s)の後に京王で増えた機能: %s' % (aud, ', '.join(new)))


def cmd_init(keio, repo):
    p = os.path.join(repo, 'UPSTREAM.json')
    if os.path.exists(p):
        print('UPSTREAM.json は既にある(上書きしない):', p); return 1
    doc = {
        '_doc': '3d-keio(上流)のどこまでをこのリポジトリへ取り込んだかの記録。取り込んだら audited と keio_commit を更新する。'
                'overrides は自動検出(tools/upstream_status.py の status)より優先:status は adopted/partial/todo/n/a と note。'
                '京王でできた機能の目録は 3d-keio の reference/porting/features.json',
        'upstream': 'a0dawa/3d-keio',
        'upstream_branch': 'claude/blender-files-push-65wzu0',
        'audited': datetime.date.today().isoformat(),
        'keio_commit': git(keio, 'rev-parse', '--short', 'HEAD'),
        'overrides': {},
    }
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('作った:', p)
    return 0


def main(argv):
    if not argv or argv[0] not in ('check', 'status', 'init'):
        print(__doc__); return 2
    keio = KEIO
    if '--keio' in argv:
        i = argv.index('--keio'); keio = os.path.abspath(argv[i + 1]); del argv[i:i + 2]
    show_all = '--all' in argv
    argv = [a for a in argv if a != '--all']
    if argv[0] == 'check':
        return cmd_check(keio)
    if len(argv) < 2:
        print('使い方: %s <repo>' % argv[0]); return 2
    repo = os.path.abspath(argv[1])
    return cmd_status(keio, repo, show_all) if argv[0] == 'status' else cmd_init(keio, repo)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]) or 0)
