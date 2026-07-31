import json, urllib.request, time, sys
from pprint import pprint

API = "http://localhost:8080/api"

def req(method, path, data=None, headers=None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(API + path, data=body, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=10)
        return json.loads(resp.read())
    except Exception as e:
        return {"_error": str(e)}

print("=" * 70)
print("1. LOGIN as admin@marshal.com")
print("=" * 70)
login = req("POST", "/auth/login", {"email": "admin@marshal.com", "password": "ChangeMe123!"})
pprint(login, indent=2, sort_dicts=False)
print()

if login.get("ok") and login.get("token"):
    token = login["token"]
    auth = {"Authorization": f"Bearer {token}"}

    print("=" * 70)
    print("2. /bookings/mine (admin user)")
    print("=" * 70)
    mine = req("GET", "/bookings/mine", headers=auth)
    pprint(mine, indent=2, sort_dicts=False)
    print()

    print("=" * 70)
    print("3. /rooms")
    print("=" * 70)
    rooms = req("GET", "/rooms")
    pprint(rooms, indent=2, sort_dicts=False)
    print()

    if rooms.get("ok") and rooms.get("data"):
        room = rooms["data"][0]
        print(f"First room available: id={room.get('id')}, name={room.get('name')}")
        print()

        print("=" * 70)
        print("4. CREATE a test booking")
        print("=" * 70)
        ts = str(int(time.time()))
        ci = time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400 * 30))
        co = time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400 * 32))
        booking_data = {
            "guestName": "Probe Tester",
            "email": f"probe_{ts}@example.com",
            "phone": "+201000000000",
            "roomId": room["id"],
            "checkin": ci,
            "checkout": co,
            "adults": 2,
            "children": 1,
            "rooms": 1
        }
        print(f"POST body: {json.dumps(booking_data, indent=2)}")
        created = req("POST", "/bookings", booking_data, headers=auth)
        pprint(created, indent=2, sort_dicts=False)
        print()

        if created.get("ok") and created.get("booking"):
            bid = created["booking"].get("id")

            print("=" * 70)
            print("5. /bookings/mine AFTER creating booking")
            print("=" * 70)
            mine2 = req("GET", "/bookings/mine", headers=auth)
            pprint(mine2, indent=2, sort_dicts=False)
            print()

            print("=" * 70)
            print("6. Admin dashboard stats")
            print("=" * 70)
            stats = req("GET", "/admin/dashboard/stats", headers=auth)
            pprint(stats, indent=2, sort_dicts=False)
            print()

else:
    print("LOGIN FAILED — no token obtained")
    sys.exit(1)
