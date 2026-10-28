import time,json,subprocess,sys
from pathlib import Path
R=Path(__file__).resolve().parent
expected=len(json.loads((R/'protocol.json').read_text())['symbols'])
while True:
 try:ready=len(json.loads((R/'manifest.json').read_text()))==expected
 except (FileNotFoundError,ValueError):ready=False
 if ready:break
 time.sleep(2)
subprocess.run([sys.executable,str(R/'analyze.py')],check=True)
subprocess.run([sys.executable,str(R/'summarize.py')],check=True)
print('Study complete',flush=True)
