import subprocess, json
# Check admin user in DB via the backend prisma
result = subprocess.run(
    ["npx.cmd", "prisma", "db", "execute", "--stdin"],
    input='SELECT id, email, role, "isActive" FROM public."User" WHERE email = \'admin@marshal.com\';',
    capture_output=True, text=True, timeout=10,
    cwd="backend"
)
print("STDOUT:", result.stdout[:500])
print("STDERR:", result.stderr[:500])
