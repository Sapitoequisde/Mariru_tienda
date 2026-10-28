"""Copy the already reviewed QA package to the specifically requested Obsidian vault.
Requires filesystem approval outside the project workspace. No application deployment.
"""
import hashlib,json,os,shutil,tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/full-test-2026-10-25'
SOURCE=OUT/'obsidian'/'QA - 2026-10-25'
VAULT=(Path.home()/'OneDrive/Documentos/Mariru').resolve()
BASE=(VAULT/'Web Mariru Bazar').resolve()
DEST=(BASE/SOURCE.name).resolve()
DEST.relative_to(VAULT)
assert (VAULT/'.obsidian').is_dir(),'Selected target is not an existing Obsidian vault'
assert SOURCE.is_dir(),'Documentation package has not been prepared'
assert not DEST.exists(),'Destination already exists; refusing to overwrite a historical QA package'
hashes=json.loads((OUT/'obsidian-source-hashes.json').read_text(encoding='utf-8'))
PATCH=OUT/'obsidian-existing-additions'
for name,expected in hashes.items():
    current=(BASE/name).resolve();current.relative_to(VAULT)
    assert hashlib.sha256(current.read_bytes()).hexdigest()==expected,f'Existing note changed since preparation: {name}'
for file in SOURCE.rglob('*'):
    assert not file.is_symlink(),'Unexpected symbolic link in prepared package'

shutil.copytree(SOURCE,DEST)
verified=0
for source in SOURCE.rglob('*'):
    if source.is_file():
        target=DEST/source.relative_to(SOURCE);target.resolve().relative_to(VAULT)
        assert hashlib.sha256(source.read_bytes()).digest()==hashlib.sha256(target.read_bytes()).digest(),str(target)
        verified+=1
BACKUP=OUT/'obsidian-note-backups';BACKUP.mkdir(exist_ok=True)
updated=[]
for patch in PATCH.glob('*.md'):
    target=(BASE/patch.name).resolve();target.relative_to(VAULT)
    shutil.copy2(target,BACKUP/patch.name)
    # Exact staged contents plus an atomic replacement prevent partially written notes.
    handle,temporary=tempfile.mkstemp(prefix='.qa-doc-',suffix='.tmp',dir=BASE)
    with os.fdopen(handle,'wb')as stream:stream.write(patch.read_bytes())
    os.replace(temporary,target)
    assert target.read_bytes()==patch.read_bytes()
    updated.append(patch.name)
receipt={'vault':str(VAULT),'destination':str(DEST),'verifiedFiles':verified,'updatedExistingNotes':updated,'summary':json.loads((OUT/'summary.json').read_text(encoding='utf-8'))}
(OUT/'obsidian-publication.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'destination':str(DEST),'verifiedFiles':verified,'updatedExistingNotes':updated},ensure_ascii=True,indent=2))
