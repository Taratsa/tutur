<script>
  import { FontAwesomeIcon } from "@fortawesome/svelte-fontawesome";
  import { faGithub, faGooglePlay, faPhp } from "@fortawesome/free-brands-svg-icons";
  import {
    faArrowRight,
    faBookOpen,
    faCheckCircle,
    faCircleInfo,
    faCode,
    faDatabase,
    faFileCode,
    faFireFlameCurved,
    faHouse,
    faArrowUpRightFromSquare,
    faXmark,
    faLayerGroup,
    faLink,
    faMagnifyingGlass,
    faRightLeft,
    faTable,
    faTerminal,
  } from "@fortawesome/free-solid-svg-icons";

  let { name, size = 20 } = $props();
  const icons = {
    home: faHouse,
    book: faBookOpen,
    check: faCheckCircle,
    link: faLink,
    swap: faRightLeft,
    info: faCircleInfo,
    search: faMagnifyingGlass,
    arrow: faArrowRight,
    github: faGithub,
    play: faGooglePlay,
    php: faPhp,
    codeigniter: faFireFlameCurved,
    database: faDatabase,
    table: faTable,
    code: faCode,
    file: faFileCode,
    layers: faLayerGroup,
    terminal: faTerminal,
    external: faArrowUpRightFromSquare,
    close: faXmark,
  };
</script>

<FontAwesomeIcon icon={icons[name] ?? faCircleInfo} style={`font-size: ${size}px`} />
