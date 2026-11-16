#!/usr/bin/env python3
"""Build the brand preview at public/new/index.html from public/index.html.

The preview applies the Fall 2026 brand voice and look (see /brand):
  - copy rewritten for the City Kid, the Cloud Builder and the Keeper
  - magenta and sky as the base, neon green and orange only on buttons
  - hill green kept for care details (access, safety, booking) so they're easy to find
  - clouds, Muni-transfer tickets, sticker labels, a whale, the Sutro mark

Run it after changing public/index.html:   python3 scripts/build-new.py
Every edit is checked; if the main page changed under one, the script stops and says which.
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'public' / 'index.html').read_text()

# Work in plain characters so the edits below can match what you'd see on the page.
for ent, ch in [('&rsquo;', '’'), ('&lsquo;', '‘'), ('&ldquo;', '“'), ('&rdquo;', '”'), ('&mdash;', '—'),
                ('&ndash;', '–'), ('&middot;', '·'), ('&rarr;', '→'), ('&hellip;', '…')]:
    src = src.replace(ent, ch)

s = src
problems = []
def sub(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        problems.append(f'expected {count}, found {n}: {old[:90]!r}')
        return
    s = s.replace(old, new)

# ------------------------------------------------------------------ plumbing
sub('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">')
sub('src="img/', 'src="/img/', count=s.count('src="img/') or 1)
sub('\n<div class="bars" aria-hidden="true"></div>\n<footer', '\n<div class="clouds clouds--ink" aria-hidden="true"></div>\n<footer')
sub('<div class="bars" aria-hidden="true"></div>', '<div class="clouds" aria-hidden="true"></div>', count=s.count('<div class="bars" aria-hidden="true"></div>') or 1)

# ------------------------------------------------------------------ HOME  (City Kid, backed by Cloud Builder)
sub('<span class="label hero-tag">An art gym in the Bayview</span>',
    '<span class="label hero-tag">An art gym at 3rd and Quint</span>')
sub('<p class="lede">SF born &amp; raised artists turning a family electrical warehouse in the Bayview into an art gym: studios, a print shop, a music room, a stage, and a retired Muni bus. Come take a look around.</p>',
    '<p class="lede">We’re SF born and raised artists turning a family electrical warehouse in the Bayview into an art gym: studios, a print shop, a music room, a stage and a retired Muni bus. Come through. We’re at 125 Quint St, right across from Islais Creek, and we’ll leave the roll-up door open.</p>\n'
    '        <p class="care-line">Free masks, Narcan and water at every event. Step-free ground floor, free parking, and the T stops on 3rd St.</p>')
sub('from Founding Community Supporters by 415 Day, April 15, 2027. That is what it takes to get this warehouse off the ground: studios artists can afford, a print shop and music room open to all, a stage of our own, and free space for the community.',
    'from Founding Community Supporters by 415 Day, April 15, 2027. That’s what it takes to get this place off the ground: studios artists can afford, a print shop and music room open to everyone, a stage with our own sound, and free space for community groups.')
sub('<h2>What we’ve done so far</h2>', '<h2>What we’ve made so far</h2>')
sub('We opened the doors in January with a stage built from scrap wood, a borrowed sound system and a retired Muni bus. Here is what this first year has looked like.',
    'We rolled up the door in January with a stage built from scrap wood, a borrowed sound system and a retired Muni bus. Many hands since then. Here’s year one.')
sub('<span>Bay Area rooted artists call the warehouse their creative home</span>', '<span>Bay Area rooted artists make work here</span>')
sub('<h2>What we’re building</h2><span class="cap" style="font-size:1.3rem">With your help</span>',
    '<h2>What we’re building</h2>WHALE<span class="cap" style="font-size:1.3rem">Many hands, over many years</span>')
sub('<h3>A print shop for everyone</h3><p>Our screen printing studio is almost ready. Next come open print days, so anyone can come in and pull a print.</p>',
    '<h3>Print with us</h3><p>The screen printing studio is almost ready. Next up: open print days. Come in, pull a print, take it home.</p>')
sub('<h3>A music room and recording studio</h3><p>Rehearsal nights for bands now, and a recording studio next, so local artists can make their music here.</p>',
    '<h3>Record here</h3><p>Bands rehearse here now. A recording studio is next, so local artists can make their music in the neighborhood.</p>')
sub('<h3>A stage with our own sound</h3><p>A permanent sound system, so shows don’t depend on borrowed gear that goes back the next morning.</p>',
    '<h3>Turn it up</h3><p>A sound system of our own. For our first show we borrowed the gear and gave it back the next morning.</p>')
sub('<h3>Walls full of murals</h3>', '<h3>Paint the walls</h3>')
sub('<div class="block b-green"><h3>A shared gear library</h3><p>Tools and instruments everyone can borrow, tracked on Community Gearbox, with training so members can use them on their own.</p>',
    '<div class="block b-pink"><h3>Borrow the tools</h3><p>A gear library everyone can use, tracked on Community Gearbox, with training so you can use it on your own.</p>')
sub('<h3>An arts resilience hub</h3>', '<h3>Get ready together</h3>')
sub('<h3>Free space for community</h3>', '<h3>Use it free</h3>')
sub('No one has to carry this alone. Here is one way 111 of us get to $3,000 a month together, each giving what fits.',
    'No one has to carry this alone. Here’s how 111 of us get to $3,000 a month, each giving what fits.')
sub('<ul class="timetable">\n        <li><span class="tt-date">March 2027</span><span class="tt-what"><strong>New murals, wall to wall',
    '<ul class="timetable transfer">\n        <li><span class="tt-date">March 2027</span><span class="tt-what"><strong>New murals, wall to wall')

sub('<section class="field f-green" style="color:var(--cream)">', '<section class="field f-ink">')   # In the news: green is saved for care

# ------------------------------------------------------------------ MISSION  (Keeper, backed by City Kid)
sub('<p>Sucka Free Collective supports working artists rooted in the San Francisco Bay Area by cultivating accessible spaces where artists, neighbors and community members can make, learn, rehearse, celebrate, and care for one another.</p>',
    '<p>We’re here so San Francisco artists can stay in San Francisco. We run a warehouse in the Bayview where artists, neighbors and whoever walks in can make, learn, rehearse, celebrate and look out for each other.</p>')
sub('<p>Through shared creative resources, affordable workspace, cultural programming and skill sharing, we are building a home where people move from attending events to becoming collaborators, contributors and community stewards.</p>',
    '<p>Come to a show. Come back to make something. Keep coming and you’re helping run the place. Shared tools, studios artists can afford, and skills passed hand to hand: that’s how a crowd becomes a crew.</p>')
sub("<p>We are based in the Bayview, one of San Francisco's last Black neighborhoods, and we are committed to celebrating and growing San Francisco born and raised artists.</p>",
    '<p>We’re in the Bayview, one of San Francisco’s last Black neighborhoods. It has carried the city’s pollution for generations, and now its people are being priced out. Artists across the city are being pushed out too. We’re building a place that stays in community hands, starting with San Francisco born and raised artists.</p>')
sub('<div class="block b-cream"><h3>Accessibility</h3><p>Sliding scale dues, an ADA accessible first floor, free parking and a train nearby. Getting in the door should never be the hard part.</p></div>',
    '<div class="block b-green"><h3>Accessibility</h3><p>Sliding scale dues, a step-free ground floor, an all-gender ADA bathroom, free parking and the T nearby. Getting in the door should never be the hard part.</p></div>')
sub('<div class="block b-pink"><h3>Radical imagination</h3><p>We live, create and dream with the most radical of imaginations so that our most radical dreams become reality.</p></div>',
    '<div class="block b-pink"><h3>Radical imagination</h3><p>Dream it out loud, then build it. A city bus became a gallery. Scrap wood became a stage. Our wildest ideas are the to-do list.</p></div>')
sub('<div class="block b-green"><h3>Joy</h3>', '<div class="block b-sky"><h3>Joy</h3>')

# ------------------------------------------------------------------ THE SPACE  (City Kid, backed by Keeper)
sub('<div class="page-head" style="--f:var(--rail);color:var(--cream)">', '<div class="page-head" style="--f:var(--pink)">')
sub('<p>Two stories, two garage doors and room for a retired Muni bus. The warehouse is family owned and commercially zoned, with studios to make work in and an open floor to share it on.</p>',
    '<p>Two stories, two garage doors and room for a retired Muni bus, at 3rd and Quint, right across from Islais Creek. The warehouse is family owned and zoned for making: studios upstairs, an open floor downstairs to share it all on.</p>')
sub('Downstairs, the stage was built from scrap wood, the sound and lights started out borrowed,',
    'Downstairs, we built the stage by hand from scrap wood, the sound and lights started out borrowed,')
sub('<div class="btn-row"><a class="btn btn--solid" href="#rent">Rent the space</a><a class="btn" href="#membership">Get member access</a></div>',
    '<div class="btn-row"><a class="btn btn--solid" href="#rent">Bring your people</a><a class="btn" href="#membership" data-tier="daytripper">Make work here</a></div>')
sub('<div class="amen block b-lav"><div class="amen-head">', '<div class="amen block b-green"><div class="amen-head">', count=1)
sub('<div class="amen block b-green"><div class="amen-head"><svg viewBox="0 0 34 34" aria-hidden="true"><path fill-rule="evenodd" d="M17 2a11',
    '<div class="amen block b-lav"><div class="amen-head"><svg viewBox="0 0 34 34" aria-hidden="true"><path fill-rule="evenodd" d="M17 2a11')
sub('<li>On the T line, which runs along 3rd St</li>', '<li>Take the T: it runs right along 3rd St</li>')
sub('<h2>Ways to use it</h2><a class="btn btn--sm" href="#rent">Ask about a booking</a></div>',
    '<h2>Ways to use it</h2><a class="btn btn--sm" href="#rent">Ask about a booking</a></div>\n      <p class="lede" style="max-width:60ch">Birthday party, memorial, rave, band practice: if it brings your people together, ask us.</p>')
for old, new in [('<b>Artist studios</b>', '<b>Rent a studio</b>'), ('<b>Music room shares</b>', '<b>Share the music room</b>'),
                 ('<b>Venue rental</b>', '<b>Throw a show</b>'), ('<b>Birthdays and celebrations</b>', '<b>Celebrate here</b>'),
                 ('<b>Socials and mixers</b>', '<b>Host a social</b>'), ('<b>Rehearsal and jam sessions</b>', '<b>Rehearse and jam</b>'),
                 ('<b>Workshops and trainings</b>', '<b>Teach or take a workshop</b>'), ('<b>Retreats and trainings</b>', '<b>Bring your team</b>'),
                 ('<b>Co-working <span class="soon">Exploring</span></b>', '<b>Co-work with us <span class="soon">Exploring</span></b>'),
                 ('<b>Open print days <span class="soon">Soon</span></b>', '<b>Print with us <span class="soon">Soon</span></b>'),
                 ('<b>Artist residency</b>', '<b>Make a project here</b>'), ('<b>Free community use</b>', '<b>Use it free</b>')]:
    sub(old, new)

# ------------------------------------------------------------------ RENT  (City Kid, backed by Keeper)
sub('<p class="lede">Book the warehouse for an event, a workshop or training, a rehearsal, a retreat or a meeting. Rentals help pay for the free and low cost programming we run for the neighborhood.</p>',
    '<p class="lede">Birthday party, memorial, rave, band practice, staff retreat: if it brings your people together, ask us. Every rental helps pay for the free and low-cost stuff we run for the neighborhood.</p>')
sub('<div class="stack" style="gap:10px"><h3 style="font-size:1.8rem">How booking works</h3>',
    '<div class="block b-green care-box"><h3 style="font-size:1.8rem">How booking works</h3>')
sub('<li>Tell us about your event: what it is, when, how many people, your budget, what you need, and how it fits what we are about.</li>',
    '<li>Tell us about it: what, when, how many people, your budget, what you need, and how it fits what we’re about.</li>')
sub('<li>Everyone signs our event agreement, so we all know what is provided and what guests are agreeing to.</li>',
    '<li>Everyone signs our event agreement, so we all know what’s provided and what guests agree to.</li>')
sub('<li>A collective member is on site. Bigger events bring security and a cleanup plan.</li>',
    '<li>Someone from the collective is on site. Bigger events bring security and a cleanup plan.</li>')
sub('<p class="fine">Step-free ground floor, an all-gender ADA bathroom, roll-up doors for airflow and four large air filters. <a href="#space">More about access</a>.</p>',
    '<p class="care-line">Step-free ground floor, an all-gender ADA bathroom, roll-up doors for airflow and four big air filters. Free masks, Narcan and water at every event. <a href="#space">More about access</a>.</p>')

# ------------------------------------------------------------------ EVENTS  (City Kid, backed by Cloud Builder)
sub('<div class="page-head" style="--f:var(--mustard)"><div class="wrap"><div><h1>Events</h1>',
    '<div class="page-head" style="--f:var(--sky)"><div class="wrap"><div><h1>Events</h1>')
sub('<p class="lede" style="max-width:62ch">The space has hosted a BIPOC queer and trans underground music crew, an Afro-Brazilian drumming crew, pan-Asian storytelling and movement artists, and visual artists who use their work to archive and advocate for their communities.</p>',
    '<p class="lede" style="max-width:62ch">The space has hosted a BIPOC queer and trans underground music crew, an Afro-Brazilian drumming crew, pan-Asian storytelling and movement artists, and visual artists who use their work to archive and advocate for their communities.</p>\n'
    '      <p class="care-line">At every event: free masks, Narcan and water. Take what you need. Step-free ground floor, an all-gender ADA bathroom, and masked and sober events on the calendar too.</p>')
sub('<h3>Screen printing</h3><p>Print sessions and trainings in the studio.</p>', '<h3>Screen printing</h3><p>Pull your own print. Sessions and trainings in the studio.</p>')
sub('<h3>Live music</h3><p>Shows, music gatherings and band practice.</p>', '<h3>Live music</h3><p>Shows, jams and band practice.</p>')
sub('<div class="block b-green"><h3>Organizing nights</h3><p>Monthly organizing events and art builds.</p>',
    '<div class="block b-lav"><h3>Organizing nights</h3><p>Monthly organizing nights and art builds: banners, signs and props.</p>')
sub('<h3>Dance parties</h3><p>Covid conscious parties on the event floor.</p>', '<h3>Dance parties</h3><p>Covid-conscious parties on the event floor, purifiers running.</p>')

# ------------------------------------------------------------------ MEMBERSHIP  (City Kid, backed by Cloud Builder)
sub('<p class="lede">This is our first year in the warehouse. We are asking our community to become Founding Community Supporters: give every month, at whatever amount fits, until together we reach $3,000 a month by 415 Day, April 15, 2027.</p>',
    '<p class="lede">Year one in the warehouse. We’re asking our people to become Founding Community Supporters: give every month, whatever fits, until together we hit $3,000 a month by 415 Day, April 15, 2027.</p>')
sub('<p class="lede" style="max-width:62ch">For artists, makers and groups who use the space. Membership starts with a passport session that shows you around the space and the tools. Members also get 15% off events and workshops, early invites and a vote on programming.</p>',
    '<p class="lede" style="max-width:62ch">Make work here: print, sew, build, rehearse, jam. Membership starts with a passport session where we show you around and teach you the tools. No experience needed. Members also get 15% off events and workshops, early invites and a vote on programming.</p>')

# ------------------------------------------------------------------ SUPPORT  (Keeper, backed by Cloud Builder)
sub('<p class="statement" style="max-width:20ch">Art spaces across SF are closing. We’re opening one, together.</p>',
    '<p class="statement" style="max-width:20ch">Artists across this city are being priced out. We’re building a place that stays.</p>')
sub('<p class="lede">Sucka Free Collective is fiscally sponsored by <a href="https://somarts.org/" target="_blank" rel="noopener">SOMArts</a>.</p>',
    '<p class="lede">Here’s exactly where your support goes. We’re fiscally sponsored by <a href="https://somarts.org/" target="_blank" rel="noopener">SOMArts</a>.</p>')
sub('<h3>Give directly</h3><p>Make a one time or recurring donation toward rent, artist stipends and materials.</p>',
    '<h3>Give directly</h3><p>Make a one-time or recurring gift toward rent, artist stipends and materials.</p>')
sub('<div class="block b-green"><h3>Sponsor or partner</h3>', '<div class="block b-ink"><h3>Sponsor or partner</h3>')
sub('<h2>What it builds</h2>', '<h2>Where it goes</h2>')

# ------------------------------------------------------------------ CONTACT + FOOTER
sub('<p class="lede">125 Quint St, San Francisco, CA 94124. The T line stops nearby and parking is free.</p>',
    '<p class="lede">125 Quint St, San Francisco, CA 94124, right across from Islais Creek. Take the T down 3rd St, or park free right at the building.</p>')
sub('<p>SF born &amp; raised artist collective and warehouse in the Bayview. Home of Muni Raised Me and <em>Altared SF</em>.',
    '<p>SF born &amp; raised artists making a home at 3rd and Quint, in the Bayview. Home of Muni Raised Me and <em>Altared SF</em>.')
sub('<p>125 Quint St, San Francisco, CA 94124<br>',
    '<p class="made-in"><img src="/favicon.svg" alt="" width="44" height="44">Made by many hands in San Francisco</p>\n      <p>125 Quint St, San Francisco, CA 94124<br>')

# ------------------------------------------------------------------ the whale (one bit of wonder on the home page)
WHALE = '''<svg class="whale" viewBox="0 0 160 100" aria-hidden="true"><g fill="none" stroke="#0b0b0b" stroke-width="3" stroke-linecap="round"><path d="M48 30c-2-9-8-15-16-17M48 30c2-11 8-17 16-19M48 30V12"/></g><path d="M14 62c0-20 22-30 48-28 26 2 42 12 54 22l20-16c8-2 12 4 8 12l-12 14 16 10c2 8-6 12-12 8l-18-10c-14 12-34 18-58 18-28 0-46-12-46-30z" fill="var(--sky)" stroke="#0b0b0b" stroke-width="3" stroke-linejoin="round"/><path d="M22 74c20 11 58 13 86 3" fill="none" stroke="#0b0b0b" stroke-width="2.5" stroke-linecap="round"/><path d="M34 80l3 7M48 83l2 7M62 84v7M76 83l-1 7M90 81l-2 7" stroke="#0b0b0b" stroke-width="2" stroke-linecap="round"/><circle cx="36" cy="56" r="3.6" fill="#0b0b0b"/><path d="M27 65c4 2 9 2 13 0" fill="none" stroke="#0b0b0b" stroke-width="2.5" stroke-linecap="round"/><path d="M70 64c5 10 16 13 26 7-9-2-17-4-26-7z" fill="var(--sky)" stroke="#0b0b0b" stroke-width="2.5" stroke-linejoin="round"/></svg>'''
sub('WHALE', WHALE)

# ------------------------------------------------------------------ the look
CLOUD = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 50' preserveAspectRatio='none'%3E"
         "%3Cpath fill='%23fffaf0' d='M0 50V38a14 14 0 0 1 22-10a20 20 0 0 1 36-8a16 16 0 0 1 28 4a24 24 0 0 1 42 0a14 14 0 0 1 24 6a18 18 0 0 1 30-2a12 12 0 0 1 18 10V50z'/%3E%3C/svg%3E")
HEART = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E"
         "%3Cpath fill='%23fffaf0' d='M12 21s-8-5.2-8-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8C20 15.8 12 21 12 21z'/%3E%3C/svg%3E")
CSS = '''
/* ================= brand preview (Fall 2026): City Kid, Cloud Builder, Keeper ================= */
:root{
  --pink:#ff2fb9;      /* magenta: a base color with sky */
  --mustard:#ffa6e3;   /* a lighter magenta, so the base stays magenta and sky */
  --tomato:#9a63ff;    /* a deeper purple; orange is saved for buttons */
  --orange:#ff5a1f;    /* calls to action, with neon green */
}
/* neon green and orange only on buttons and calls to action */
.btn--solid,.cta{background:var(--lime);color:var(--ink);border-color:var(--ink)}
.btn--solid:hover,.cta:hover{background:var(--orange);color:var(--ink);border-color:var(--ink)}
.btn:hover{background:var(--orange);color:var(--ink);border-color:var(--ink)}
.f-ink .btn:hover{background:var(--orange);color:var(--ink);border-color:var(--orange)}
.nav a[aria-current="page"]{background:var(--pink);color:var(--ink)}
.cta[aria-current="page"]{background:var(--orange)}
.amounts a:hover{background:var(--lime);border-color:var(--ink);color:var(--ink)}
.offer:hover{background:var(--lime);color:var(--ink)}
.offer:hover .soon{background:var(--ink);color:var(--cream)}

/* hill green is for care: access, safety, booking. One steady color, easy to find. */
.foot{background:var(--ink)}
.foot .tiles span:nth-child(even){background:var(--pink);color:var(--ink)}
.care-line{position:relative;background:var(--rail);color:var(--cream);padding:14px 18px 15px 50px;font-size:1.0625rem;line-height:1.6;max-width:66ch}
.care-line::before{content:"";position:absolute;left:17px;top:17px;width:22px;height:22px;background:url("HEART") center/contain no-repeat}
.care-line a{color:var(--cream)}
.care-box{padding:20px 22px 22px}
.b-green .ticks li,.care-box li{line-height:1.6}

/* clouds where the bar band used to sit under each page header */
.clouds{height:clamp(36px,5vw,64px);margin-top:calc(-1 * clamp(36px,5vw,64px));position:relative;z-index:2;background:url("CLOUD") repeat-x left bottom/clamp(220px,26vw,360px) 100%;pointer-events:none}
.clouds--ink{background-image:url("CLOUDINK")}
.page-head{padding-bottom:calc(clamp(36px,6vw,80px) + clamp(28px,4vw,52px))}
.hero .hero-labels{padding-bottom:calc(clamp(18px,3vw,40px) + clamp(36px,5vw,64px))}

/* sticker labels on page headers */
.page-head .sub .label{border:2px solid var(--ink);border-radius:10px;transform:rotate(-2deg);padding:.12em .3em .14em}

/* Muni transfers for what's next */
.transfer{border-top:0;display:grid;gap:14px}
.transfer li{--tc:var(--sky);background:var(--tc);border:2px solid var(--ink);padding:16px 30px;grid-template-columns:minmax(130px,190px) 1fr auto;align-items:stretch;
  -webkit-mask:radial-gradient(circle at 0 50%,#0000 13px,#000 14px) left/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 13px,#000 14px) right/51% 100% no-repeat;
          mask:radial-gradient(circle at 0 50%,#0000 13px,#000 14px) left/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 13px,#000 14px) right/51% 100% no-repeat}
.transfer li:nth-child(4n+2){--tc:var(--pink)}
.transfer li:nth-child(4n+3){--tc:var(--lav)}
.transfer li:nth-child(4n+4){--tc:var(--mustard)}
.transfer .tt-date{display:flex;align-items:center;border-right:2px dashed var(--ink);padding-right:18px}
.transfer .tt-what{align-self:center}
.transfer .tt-what strong{font-size:clamp(1.8rem,3.4vw,2.8rem)}
.transfer .chip{align-self:center;background:var(--cream) !important;border:2px solid var(--ink)}
@media (max-width:680px){.transfer li{padding:16px 24px;grid-template-columns:1fr;gap:10px}.transfer .chip{justify-self:start}.transfer .tt-date{border-right:0;border-bottom:2px dashed var(--ink);padding:0 0 10px}}

/* a whale for wonder, once */
.head:has(.whale){position:relative}
.head .whale{position:absolute;right:0;top:calc(-1 * clamp(36px,4.5vw,64px));width:clamp(100px,13vw,170px);height:auto;transform:rotate(-6deg);pointer-events:none}
@media (max-width:700px){.head .whale{position:static;width:96px;order:3}}

/* the Sutro mark in the footer */
.made-in{display:flex;align-items:center;gap:10px;font-family:var(--narrow);font-stretch:72%;font-weight:700;text-transform:uppercase;font-size:1.1rem}
.made-in img{flex:none;background:var(--cream);border-radius:50%;padding:3px}
'''.replace('HEART', HEART).replace('CLOUDINK', CLOUD.replace('%23fffaf0', '%230b0b0b')).replace('CLOUD', CLOUD)
sub('</style>\n</head>', CSS + '</style>\n</head>')

if problems:
    print('Could not build /new/. These spots on the main page changed:', file=sys.stderr)
    for p in problems:
        print('  -', p, file=sys.stderr)
    sys.exit(1)

out = ROOT / 'public' / 'new' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(s)
print(f'Built {out.relative_to(ROOT)}')
