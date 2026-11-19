# The World in One Image — Wednesday 18 November 2026

A program that draws one newspaper front page summing up the world news of 18 November 2026. Six stories, drawn pixel by pixel: no fonts, no images from the internet, no network at all.

The six stories: US strikes on Iran's Qeshm Island and Iran's reply on US bases in Bahrain and Kuwait; Ukraine hitting the Kerch Bridge; Trump arriving in China for a three-way summit with Xi and Putin; Peltola winning Alaska as Democrats take a 56-44 Senate majority; the US losing measles elimination status after 26 years; Voyager 1 crossing one light-day from Earth.

How to run it:

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

It writes `out/entry.png` (1024x1024). Run it twice and you get the exact same bytes both times. That is the point: the picture is fully deterministic.

Built for the make.fun news-image-20261118 competition. Submitted 18 Nov 2026.
