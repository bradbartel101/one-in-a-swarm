#!/usr/bin/env python3
"""Generates tools/bank/10-geography.src.txt: the general prompts that are views of one table of
the world's 195 countries (193 UN members plus Vatican City and Palestine). One table means one
place to fix a name, and the closed-list counts follow from it. Run: python3 tools/gen/geography.py"""
import os

# name | aliases ; capital | capital aliases ; continent ; L if landlocked
ROWS = """
Afghanistan;Kabul;AS;L
Albania;Tirana | Tirane;EU;
Algeria;Algiers;AF;
Andorra;Andorra la Vella;EU;L
Angola;Luanda;AF;
Antigua and Barbuda | Antigua | Antigua & Barbuda;Saint John's | St. John's | St Johns;NA;
Argentina;Buenos Aires;SA;
Armenia;Yerevan;AS;L
Australia;Canberra;OC;
Austria;Vienna | Wien;EU;L
Azerbaijan;Baku;AS;L
Bahamas | The Bahamas;Nassau;NA;
Bahrain;Manama;AS;
Bangladesh;Dhaka | Dacca;AS;
Barbados;Bridgetown;NA;
Belarus;Minsk;EU;L
Belgium;Brussels | Bruxelles;EU;
Belize;Belmopan;NA;
Benin;Porto-Novo | Porto Novo;AF;
Bhutan;Thimphu;AS;L
Bolivia;Sucre | La Paz;SA;L
Bosnia and Herzegovina | Bosnia | Bosnia & Herzegovina | Bosnia-Herzegovina;Sarajevo;EU;
Botswana;Gaborone;AF;L
Brazil | Brasil;Brasília | Brasilia;SA;
Brunei | Brunei Darussalam;Bandar Seri Begawan;AS;
Bulgaria;Sofia;EU;
Burkina Faso;Ouagadougou;AF;L
Burundi;Gitega;AF;L
Cabo Verde | Cape Verde;Praia;AF;
Cambodia;Phnom Penh;AS;
Cameroon;Yaoundé | Yaounde;AF;
Canada;Ottawa;NA;
Central African Republic | CAR;Bangui;AF;L
Chad;N'Djamena | NDjamena;AF;L
Chile;Santiago;SA;
China | People's Republic of China | PRC;Beijing | Peking;AS;
Colombia;Bogotá | Bogota;SA;
Comoros;Moroni;AF;
Congo | Republic of the Congo | Congo-Brazzaville | Congo Brazzaville;Brazzaville;AF;
Costa Rica;San José | San Jose;NA;
Croatia;Zagreb;EU;
Cuba;Havana | La Habana;NA;
Cyprus;Nicosia;AS;
Czech Republic | Czechia;Prague | Praha;EU;L
Democratic Republic of the Congo | DR Congo | DRC | Congo-Kinshasa | Congo Kinshasa;Kinshasa;AF;
Denmark;Copenhagen;EU;
Djibouti;Djibouti City;AF;
Dominica;Roseau;NA;
Dominican Republic;Santo Domingo;NA;
Ecuador;Quito;SA;
Egypt;Cairo;AF;
El Salvador;San Salvador;NA;
Equatorial Guinea;Malabo;AF;
Eritrea;Asmara;AF;
Estonia;Tallinn;EU;
Eswatini | Swaziland;Mbabane;AF;L
Ethiopia;Addis Ababa;AF;L
Fiji;Suva;OC;
Finland;Helsinki;EU;
France;Paris;EU;
Gabon;Libreville;AF;
Gambia | The Gambia;Banjul;AF;
Georgia;Tbilisi;AS;
Germany | Deutschland;Berlin;EU;
Ghana;Accra;AF;
Greece;Athens;EU;
Grenada;Saint George's | St. George's | St Georges;NA;
Guatemala;Guatemala City;NA;
Guinea;Conakry;AF;
Guinea-Bissau | Guinea Bissau;Bissau;AF;
Guyana;Georgetown;SA;
Haiti;Port-au-Prince | Port au Prince;NA;
Honduras;Tegucigalpa;NA;
Hungary;Budapest;EU;L
Iceland;Reykjavík | Reykjavik;EU;
India;New Delhi | Delhi;AS;
Indonesia;Jakarta;AS;
Iran;Tehran | Teheran;AS;
Iraq;Baghdad;AS;
Ireland | Republic of Ireland;Dublin;EU;
Israel;Jerusalem;AS;
Italy | Italia;Rome | Roma;EU;
Ivory Coast | Côte d'Ivoire | Cote d'Ivoire | Cote dIvoire;Yamoussoukro;AF;
Jamaica;Kingston;NA;
Japan;Tokyo;AS;
Jordan;Amman;AS;
Kazakhstan;Astana | Nur-Sultan | Nur Sultan;AS;L
Kenya;Nairobi;AF;
Kiribati;Tarawa | South Tarawa;OC;
Kosovo;Pristina | Prishtina;EU;L;X
Kuwait;Kuwait City;AS;
Kyrgyzstan;Bishkek;AS;L
Laos;Vientiane;AS;L
Latvia;Riga;EU;
Lebanon;Beirut;AS;
Lesotho;Maseru;AF;L
Liberia;Monrovia;AF;
Libya;Tripoli;AF;
Liechtenstein;Vaduz;EU;L
Lithuania;Vilnius;EU;
Luxembourg;Luxembourg City;EU;L
Madagascar;Antananarivo;AF;
Malawi;Lilongwe;AF;L
Malaysia;Kuala Lumpur;AS;
Maldives | The Maldives;Malé | Male;AS;
Mali;Bamako;AF;L
Malta;Valletta;EU;
Marshall Islands;Majuro;OC;
Mauritania;Nouakchott;AF;
Mauritius;Port Louis;AF;
Mexico | México;Mexico City | Ciudad de México;NA;
Micronesia | Federated States of Micronesia;Palikir;OC;
Moldova;Chișinău | Chisinau | Kishinev;EU;L
Monaco;Monaco City;EU;
Mongolia;Ulaanbaatar | Ulan Bator;AS;L
Montenegro;Podgorica;EU;
Morocco;Rabat;AF;
Mozambique;Maputo;AF;
Myanmar | Burma;Naypyidaw | Nay Pyi Taw | Naypyitaw;AS;
Namibia;Windhoek;AF;
Nauru;Yaren;OC;
Nepal;Kathmandu;AS;L
Netherlands | The Netherlands | Holland;Amsterdam;EU;
New Zealand | Aotearoa;Wellington;OC;
Nicaragua;Managua;NA;
Niger;Niamey;AF;L
Nigeria;Abuja;AF;
North Korea | DPRK;Pyongyang;AS;
North Macedonia | Macedonia;Skopje;EU;L
Norway;Oslo;EU;
Oman;Muscat;AS;
Pakistan;Islamabad;AS;
Palau;Ngerulmud;OC;
Palestine | State of Palestine;Ramallah;AS;
Panama;Panama City;NA;
Papua New Guinea | PNG;Port Moresby;OC;
Paraguay;Asunción | Asuncion;SA;L
Peru | Perú;Lima;SA;
Philippines | The Philippines;Manila;AS;
Poland;Warsaw | Warszawa;EU;
Portugal;Lisbon | Lisboa;EU;
Qatar;Doha;AS;
Romania;Bucharest;EU;
Russia | Russian Federation;Moscow;EU;
Rwanda;Kigali;AF;L
Saint Kitts and Nevis | St. Kitts and Nevis | St Kitts | Saint Kitts | St Kitts and Nevis;Basseterre;NA;
Saint Lucia | St. Lucia | St Lucia;Castries;NA;
Saint Vincent and the Grenadines | St. Vincent and the Grenadines | St Vincent | Saint Vincent;Kingstown;NA;
Samoa;Apia;OC;
San Marino;San Marino City;EU;L
São Tomé and Príncipe | Sao Tome and Principe | Sao Tome;São Tomé City;AF;
Saudi Arabia;Riyadh;AS;
Senegal;Dakar;AF;
Serbia;Belgrade | Beograd;EU;L
Seychelles;Victoria;AF;
Sierra Leone;Freetown;AF;
Singapore;Singapore City;AS;
Slovakia;Bratislava;EU;L
Slovenia;Ljubljana;EU;
Solomon Islands;Honiara;OC;
Somalia;Mogadishu;AF;
South Africa;Pretoria | Cape Town | Bloemfontein;AF;
South Korea | Korea | Republic of Korea;Seoul;AS;
South Sudan;Juba;AF;L
Spain | España;Madrid;EU;
Sri Lanka;Colombo | Sri Jayawardenepura Kotte | Kotte;AS;
Sudan;Khartoum;AF;
Suriname;Paramaribo;SA;
Sweden;Stockholm;EU;
Switzerland;Bern | Berne;EU;L
Syria;Damascus;AS;
Tajikistan;Dushanbe;AS;L
Tanzania;Dodoma | Dar es Salaam;AF;
Thailand;Bangkok;AS;
Timor-Leste | East Timor | Timor Leste;Dili;AS;
Togo;Lomé | Lome;AF;
Tonga;Nukuʻalofa | Nukualofa;OC;
Trinidad and Tobago | Trinidad | Trinidad & Tobago;Port of Spain;NA;
Tunisia;Tunis;AF;
Turkey | Türkiye | Turkiye;Ankara;AS;
Turkmenistan;Ashgabat;AS;L
Tuvalu;Funafuti;OC;
Uganda;Kampala;AF;L
Ukraine;Kyiv | Kiev;EU;
United Arab Emirates | UAE | Emirates;Abu Dhabi;AS;
United Kingdom | UK | Great Britain | Britain | England;London;EU;
United States | USA | US | America | United States of America;Washington, D.C. | Washington | Washington DC | DC;NA;
Uruguay;Montevideo;SA;
Uzbekistan;Tashkent;AS;L
Vanuatu;Port Vila;OC;
Vatican City | Vatican | Holy See | The Vatican;Vatican City State;EU;L
Venezuela;Caracas;SA;
Vietnam | Viet Nam;Hanoi;AS;
Yemen;Sanaa | Sana'a;AS;
Zambia;Lusaka;AF;L
Zimbabwe;Harare;AF;L
"""
# Kosovo is recognised by about half the UN's members and is not on the 195 list; it is kept
# in this table only so that it can be named as a deliberate rejection.
rows = []
for line in ROWS.strip().split('\n'):
    parts = [p.strip() for p in line.split(';')]
    names = [n.strip() for n in parts[0].split('|')]
    caps = [c.strip() for c in parts[1].split('|')]
    rows.append({'name': names[0], 'aliases': names[1:], 'cap': caps[0], 'capaliases': caps[1:], 'cont': parts[2], 'landlocked': len(parts) > 3 and parts[3] == 'L', 'extra': len(parts) > 4})
countries = [r for r in rows if not r['extra']]
assert len(countries) == 195, len(countries)

COMMON = 'United States Canada Mexico China Japan France Germany Italy Spain Brazil India Russia Australia'.split(' ')
COMMON = ['United States', 'Canada', 'Mexico', 'China', 'Japan', 'France', 'Germany', 'Italy', 'Spain', 'Brazil', 'India', 'Russia', 'Australia', 'United Kingdom']
SOLID = ['Argentina', 'Egypt', 'Greece', 'Ireland', 'South Korea', 'North Korea', 'Sweden', 'Norway', 'Netherlands', 'Portugal', 'Poland', 'Turkey', 'Israel', 'Iran', 'Iraq', 'Saudi Arabia', 'South Africa', 'Nigeria', 'Kenya', 'Thailand', 'Vietnam', 'Philippines', 'Indonesia', 'New Zealand', 'Switzerland', 'Belgium', 'Austria', 'Denmark', 'Finland', 'Iceland', 'Cuba', 'Jamaica', 'Colombia', 'Peru', 'Chile', 'Venezuela', 'Ukraine', 'Pakistan', 'Afghanistan', 'Morocco', 'Ethiopia', 'Ghana', 'Singapore', 'Malaysia']
DEEP = ['Kiribati', 'Tuvalu', 'Nauru', 'Palau', 'Comoros', 'Vanuatu', 'Micronesia', 'Marshall Islands', 'São Tomé and Príncipe', 'Eswatini', 'Lesotho', 'Djibouti', 'Eritrea', 'Burundi', 'Guinea-Bissau', 'Equatorial Guinea', 'Gabon', 'Togo', 'Benin', 'Burkina Faso', 'Mauritania', 'Cabo Verde', 'Seychelles', 'Mauritius', 'Suriname', 'Guyana', 'Saint Kitts and Nevis', 'Saint Vincent and the Grenadines', 'Dominica', 'Grenada', 'Antigua and Barbuda', 'Saint Lucia', 'Brunei', 'Timor-Leste', 'Bhutan', 'Tajikistan', 'Turkmenistan', 'Kyrgyzstan', 'Andorra', 'San Marino', 'Liechtenstein', 'Moldova', 'North Macedonia', 'Montenegro', 'Solomon Islands', 'Tonga', 'Samoa', 'Central African Republic', 'South Sudan', 'Malawi', 'Gambia', 'Sierra Leone', 'Liberia', 'Niger', 'Chad', 'Mali', 'Palestine', 'Vatican City', 'Monaco']

def tier(name, common, clever, swarm, solid=SOLID, deep=DEEP):
    if name == swarm: return 'X'
    if name in common: return 'C'
    if name in clever: return 'T'
    if name in solid: return 'S'
    if name in deep: return 'D'
    return 'R'

def line(t, names, note=''):
    return t + ' ' + ' | '.join(names) + (' :: ' + note if note else '')

out = ['# GENERATED by tools/gen/geography.py from one table of 195 countries. Edit the table there, not this file.', '']

def block(pid, cat, text, opts, items, rejected):
    out.append('@' + ' | '.join([pid, cat, text] + opts))
    out.extend(items)
    out.extend('! ' + g + ' :: ' + r for g, r in rejected)
    out.append('')

NOT_COUNTRIES = [('Kosovo', 'recognised by about half the world; not on the list of 195 used here'), ('Taiwan', 'not a UN member or observer state; left off the list of 195 used here'), ('Hong Kong', 'a region of China'), ('Puerto Rico', 'a U.S. territory'), ('Greenland', 'part of the Kingdom of Denmark'), ('Scotland', 'part of the United Kingdom'), ('Wales', 'part of the United Kingdom'), ('Antarctica', 'a continent with no country'), ('Africa', 'a continent'), ('Europe', 'a continent'), ('Tibet', 'a region of China'), ('Bermuda', 'a British territory'), ('Guam', 'a U.S. territory'), ('Western Sahara', 'a disputed territory'), ('Soviet Union', 'dissolved in 1991'), ('Yugoslavia', 'no longer exists'), ('Czechoslovakia', 'split into two countries in 1993')]

# 1. any country (easy opener)
block('countries', 'WORLD', 'Name a country', ['pool=general', 'easy', 'type=closed', 'count=195', 'source=the 193 UN member states plus Vatican City and Palestine', 'clar=one of the 195 sovereign states'],
      [line(tier(c['name'], COMMON, ['Vatican City', 'Monaco', 'Liechtenstein'], 'Kiribati'), [c['name']] + c['aliases'], 'Said "KIRR-i-bass". It straddles all four hemispheres.' if c['name'] == 'Kiribati' else '') for c in countries], NOT_COUNTRIES)

# 2. capital cities
CAPC = ['Washington, D.C.', 'London', 'Paris', 'Tokyo', 'Beijing', 'Rome', 'Berlin', 'Moscow', 'Madrid', 'Ottawa', 'Mexico City']
CAPS = ['Athens', 'Dublin', 'Cairo', 'Seoul', 'New Delhi', 'Canberra', 'Vienna', 'Lisbon', 'Stockholm', 'Oslo', 'Copenhagen', 'Amsterdam', 'Brussels', 'Havana', 'Buenos Aires', 'Bangkok', 'Baghdad', 'Tehran', 'Jerusalem', 'Kyiv', 'Warsaw', 'Budapest', 'Prague', 'Helsinki', 'Brasília', 'Lima', 'Bogotá', 'Santiago', 'Nairobi', 'Kabul', 'Manila', 'Hanoi', 'Jakarta', 'Wellington', 'Bern', 'Ankara', 'Riyadh', 'Kingston', 'Caracas', 'Singapore City', 'Islamabad', 'Reykjavík']
caps = []
for c in countries:
    t = 'X' if c['cap'] == 'Ngerulmud' else 'C' if c['cap'] in CAPC else 'T' if c['cap'] in ['Canberra', 'Ottawa', 'Bern'] else 'S' if c['cap'] in CAPS else 'D' if c['name'] in DEEP else 'R'
    if c['cap'] in ['Ottawa']: t = 'C'
    note = 'Palau. The least populous national capital in the world.' if c['cap'] == 'Ngerulmud' else c['name'] + '.'
    caps.append(line(t, [c['cap']] + c['capaliases'], note))
block('capitals', 'WORLD', 'Name the capital city of a country', ['pool=general', 'type=closed', 'count=195', 'source=one capital for each of the 195 countries; a second official capital is an alias', 'clar=national capitals, not state or provincial ones'], caps,
      [('New York', 'the capital of the United States is Washington, D.C.'), ('Sydney', "Australia's capital is Canberra"), ('Toronto', "Canada's capital is Ottawa"), ('Istanbul', "Turkey's capital is Ankara"), ('Rio de Janeiro', "Brazil's capital is Brasília"), ('Zurich', "Switzerland's capital is Bern"), ('Geneva', "Switzerland's capital is Bern"), ('Auckland', "New Zealand's capital is Wellington"), ('Lagos', "Nigeria's capital is Abuja"), ('Shanghai', "China's capital is Beijing"), ('Mumbai', "India's capital is New Delhi"), ('Dubai', "the UAE's capital is Abu Dhabi"), ('Atlanta', 'a state capital, not a national one'), ('Johannesburg', "South Africa's capitals are Pretoria, Cape Town and Bloemfontein"), ('Tel Aviv', 'listed under Jerusalem, the seat of government'), ('Barcelona', "Spain's capital is Madrid"), ('Milan', "Italy's capital is Rome"), ('Casablanca', "Morocco's capital is Rabat"), ('Ho Chi Minh City', "Vietnam's capital is Hanoi"), ('Karachi', "Pakistan's capital is Islamabad")])

# 3. Africa
af = [c for c in countries if c['cont'] == 'AF']
assert len(af) == 54, len(af)
block('africa', 'WORLD', 'Name a country in Africa', ['pool=general', 'type=closed', 'count=54', 'source=the 54 African member states of the UN'],
      [line(tier(c['name'], ['Egypt', 'South Africa', 'Nigeria', 'Kenya', 'Morocco'], ['Madagascar'], 'São Tomé and Príncipe', ['Ethiopia', 'Ghana', 'Algeria', 'Tanzania', 'Uganda', 'Zimbabwe', 'Sudan', 'Libya', 'Tunisia', 'Somalia', 'Senegal', 'Rwanda', 'Angola', 'Cameroon', 'Democratic Republic of the Congo', 'Congo', 'Ivory Coast', 'Mali', 'Zambia', 'Mozambique', 'Botswana', 'Namibia', 'Chad', 'Niger'], ['Comoros', 'Eswatini', 'Lesotho', 'Djibouti', 'Eritrea', 'Burundi', 'Guinea-Bissau', 'Equatorial Guinea', 'Cabo Verde', 'Seychelles', 'Mauritius', 'Gambia', 'Togo', 'Benin', 'Mauritania', 'Central African Republic', 'South Sudan', 'Gabon']), [c['name']] + c['aliases'], 'Two islands on the equator, in the Gulf of Guinea.' if c['name'].startswith('São') else '') for c in af],
      [('Western Sahara', 'a disputed territory, not a UN member'), ('Zanzibar', 'part of Tanzania'), ('Yemen', 'in Asia, across the Red Sea'), ('Jamaica', 'in the Caribbean'), ('Haiti', 'in the Caribbean'), ('Guyana', 'in South America'), ('Israel', 'in Asia'), ('Saudi Arabia', 'in Asia'), ('Wakanda', 'fictional'), ('Zaire', 'now the Democratic Republic of the Congo'), ('Rhodesia', 'now Zimbabwe'), ('Somaliland', 'not internationally recognised')])

# 4. landlocked
ll = [c for c in countries if c['landlocked']]
assert len(ll) == 44, len(ll)  # 43 UN members plus Vatican City; Kosovo is not on the list of 195
block('landlocked', 'WORLD', 'Name a landlocked country', ['pool=general', 'type=closed', 'count=44', 'source=countries on the list of 195 with no ocean coastline', 'clar=no coast on any ocean or open sea'],
      [line(tier(c['name'], ['Switzerland', 'Austria', 'Afghanistan', 'Mongolia', 'Bolivia'], ['Paraguay', 'Vatican City'], 'Liechtenstein', ['Hungary', 'Czech Republic', 'Nepal', 'Kazakhstan', 'Ethiopia', 'Uganda', 'Zimbabwe', 'Zambia', 'Serbia', 'Slovakia', 'Luxembourg', 'Belarus', 'Laos', 'Chad', 'Mali', 'Niger', 'Rwanda', 'Botswana'], ['Eswatini', 'Lesotho', 'Burundi', 'Burkina Faso', 'Central African Republic', 'South Sudan', 'Malawi', 'Bhutan', 'Tajikistan', 'Turkmenistan', 'Kyrgyzstan', 'Andorra', 'San Marino', 'Moldova', 'North Macedonia', 'Azerbaijan', 'Armenia', 'Uzbekistan']), [c['name']] + c['aliases'], 'Doubly landlocked: every neighbour is landlocked too. Only Uzbekistan shares that.' if c['name'] == 'Liechtenstein' else '') for c in ll],
      [('Kosovo', 'landlocked, but not on the list of 195 used here'), ('Germany', 'has coasts on the North Sea and the Baltic'), ('Poland', 'has a Baltic coast'), ('Iraq', 'has a short coast on the Persian Gulf'), ('Jordan', 'has a port on the Red Sea at Aqaba'), ('Bosnia and Herzegovina', 'has about 12 miles of Adriatic coast'), ('Democratic Republic of the Congo', 'has a short Atlantic coast'), ('Slovenia', 'has a short Adriatic coast'), ('Sudan', 'has a Red Sea coast'), ('Kansas', 'a U.S. state'), ('Tibet', 'a region of China'), ('Belgium', 'has a North Sea coast'), ('Ukraine', 'has a Black Sea coast'), ('Georgia', 'has a Black Sea coast'), ('Russia', 'has thousands of miles of coast')])

# 5. the twist: countries whose English name ends in the letter A
ea = [c for c in countries if c['name'].lower().endswith('a')]
block('endsina', 'WORDS', 'Name a country whose name ends in the letter A', ['pool=general', 'type=closed', 'count=%d' % len(ea), 'source=worked out from the list of 195 countries, by their usual English names', 'clar=like Canada'],
      [line(tier(c['name'], ['Canada', 'China', 'India', 'Russia', 'Australia', 'Argentina', 'Cuba', 'Jamaica'], ['Georgia'], 'Dominica', ['Austria', 'South Africa', 'Nigeria', 'Kenya', 'South Korea', 'North Korea', 'Colombia', 'Venezuela', 'Saudi Arabia', 'Indonesia', 'Malaysia', 'Ethiopia', 'Ghana', 'Algeria', 'Panama', 'Costa Rica', 'Syria', 'Libya', 'Romania', 'Bulgaria', 'Croatia', 'Serbia', 'Somalia', 'Uganda', 'Tanzania', 'Guatemala', 'Nicaragua', 'Bolivia', 'Sri Lanka', 'Mongolia', 'Cambodia', 'Armenia', 'Albania']), [c['name']] + [a for a in c['aliases'] if a.lower().endswith('a')], 'Not the Dominican Republic: the small island between Guadeloupe and Martinique.' if c['name'] == 'Dominica' else 'The country. The state would not count, but the spelling is the same.' if c['name'] == 'Georgia' else '') for c in ea],
      [('America', 'the country is the United States'), ('Burma', 'now Myanmar on this list'), ('Czechoslovakia', 'no longer exists'), ('Yugoslavia', 'no longer exists'), ('Rhodesia', 'now Zimbabwe'), ('Africa', 'a continent'), ('Asia', 'a continent'), ('Antarctica', 'a continent'), ('Florida', 'a U.S. state'), ('Brazil', 'ends in L'), ('Chile', 'ends in E')])

here = os.path.dirname(os.path.abspath(__file__))
open(os.path.join(here, '..', 'bank', '10-geography.src.txt'), 'w').write('\n'.join(out))
print('countries', len(countries), 'africa', len(af), 'landlocked', len(ll), 'ends in A', len(ea))
