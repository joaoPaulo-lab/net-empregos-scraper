import { chromium } from 'playwright'
import fs from 'fs';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';



//É necessário fazer duas vezes o scrapping então fiz uma função
//Faz scraping do texto dos options e valor das prop. values
async function dropBoxScrapper(dropBox) {
    let optionsAndValues = []
    let i = 0;
    //Scraping das opções de Categorias
    for (const option of await dropBox.locator('option').all()) {

        let titulo = await option.textContent();
        let valor = await option.getAttribute('value');
        
        optionsAndValues.push({
            "index": i,
            "titulo":titulo,
            "valor":valor
        });
        i++;
    }
    return optionsAndValues;
}

function mostrarLista(itens){
   
    for (let item of itens) {
        console.log(`${item.index} - ${item.titulo}`);
    }
}

async function fazerPergunta(pergunta){

    const rl = readline.createInterface({ input, output });
    const resposta = await rl.question(pergunta); 
    rl.close();
    return resposta;
}


async function pegarLinks(page) {
    let linkVagas = [];
    

    await page.waitForSelector('.job-item');
    const jobs = page.locator('.job-item');

    let quantidadeVagas = await jobs.count();
    console.log(quantidadeVagas + ' vagas encontradas na página atual.');

    for (let i = 0; i < quantidadeVagas; i++) {

        console.log(`Processando vaga ${i + 1} de ${quantidadeVagas}`);

        const job = await jobs.nth(i);
        
        try {
    
            let href = await job.locator('a.oferta-link').first().getAttribute('href');
            
            linkVagas.push(href);

        }catch(error){

            console.log(`Somente ${i} vagas atendem os parametros.`)
            break;

        }
    }
    return linkVagas;
}

async function definirPesquisa(page){

    const formCategorias = page.locator('#categoria');
    const formZonas = page.locator('#zona');
    const formChave = page.locator('#chaves');
    
    //Pega a lista de categorias e zonas
    let categorias = await dropBoxScrapper(formCategorias);
    let zonas = await dropBoxScrapper(formZonas);
    
    //PERGUNTAS
    console.log('Categorias');
    mostrarLista(categorias);


    const escolhaCategoria = await fazerPergunta('Escolha a categoria pelo index: ')
    //Separa o objeto escolhido.
    const categoriaEscolhida =  categorias.find(categoria=>categoria.index == parseInt(escolhaCategoria))
    
    console.log('Em qual zona deseja fazer a pesquisa?');
    
    console.log('Zonas');
    mostrarLista(zonas);
    

    
    const escolhaZona = await fazerPergunta('Escolha a zona pelo index: ')
    //Separa o objeto escolhido.
    const zonaEscolhida =  zonas.find(zona=>zona.index == parseInt(escolhaZona))
    
    const escolhaChave = await fazerPergunta('Escolha uma palavra chave ex: Suporte, Vendas: ')
    let chave =  escolhaChave.replaceAll(' ','+')
    
 
    
    console.log(`A procurar vagas de ${categoriaEscolhida.titulo} com ${chave} na zona de ${zonaEscolhida.titulo}...`);
    
    await formChave.fill(escolhaChave);
    await formCategorias.selectOption(categoriaEscolhida.valor);
    await formZonas.selectOption(zonaEscolhida.valor);

    return {chave:chave, zonaEscolhida: zonaEscolhida.valor, categoriaEscolhida: categoriaEscolhida.valor }
}

async function pegaLinksPorPagina(context,chave,categoriaEscolhida,zonaEscolhida,totalPaginas){
    //Loop começa na pagina 2 

    let linksPorPagina = []
        for (let i = 2; i <= totalPaginas; i++) {

            console.log(`Acessando página ${i} de ${totalPaginas}`);

            
            let pesquisaPorUrl = `https://www.net-empregos.com/pesquisa-empregos.asp?page=${i}&chaves=${chave}&cidade=&categoria=${categoriaEscolhida}&zona=${zonaEscolhida}&tipo=0`;  
            //abre uma nova pagina
            let newP = await context.newPage();
            try {
                await newP.goto(pesquisaPorUrl);
                //Desconstroi o array que recebe e insere os valores no array linkVagas
                linksPorPagina.push(...await pegarLinks(newP));
                
            } catch (error) {
                console.log(` página ${i} falhou, pulando para a proxima`)
            } finally{
                await newP.close()
            }

        }
    return linksPorPagina;
}

async function acederVagasEGravarConteudos(context,linkVagas) {
    for (let i = 0; i < linkVagas.length; i++) {

        let novaUrl = 'https://www.net-empregos.com' + linkVagas[i];
        
        const newPage = await context.newPage()

        try {
            console.log(`Acessando vaga ${i + 1} de ${linkVagas.length}`);
            let partes = linkVagas[i].split('/')

            let infoVagaUrl = {
                ref: partes[1],
                nome: partes[2]
            }


            await newPage.goto(novaUrl);
        
            let dadosJob = await newPage.locator('script[type="application/ld+json"]').textContent();

            
            // Remove dados que quebram o JSON --
            dadosJob = dadosJob
            .replace(/\r?\n|\r/g, ' ')
            .replace(/\t/g, ' ')
            .replace(/<br\s*\/?>/gi, '\\n')
            .trim();
            
            
            //Todo, decidir o que fazer com os Jsons...
            // const jsonJob = JSON.parse(dadosJob);

            fs.writeFileSync(`../data/vaga_${infoVagaUrl.ref}_${infoVagaUrl.nome}.json`, dadosJob);

            
        } catch (error) {

            console.log(error);
            console.log('Scraping da vaga falhou, passando para a próxima. ')
            
            continue;

        } finally
        {
            await newPage.close();
        }
          
        
    }
}


async function run() { 
    await fs.promises.mkdir('data', { recursive: true });
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('A aceder website...')
    await page.goto('https://www.net-empregos.com/');
    
    //Remove as perguntas iniciais ao abrir o site, cookies e notificações.
    await page.getByRole('button', { name: 'Permitir seleção' }).click();
    await page.getByRole('button', { name: 'Não Ativar' }).click();

    //LISTAR INFORMAÇÕES E REQUISITAR INPUT DO USER
    //Locators de forms importantes

    const {chave,zonaEscolhida,categoriaEscolhida} = await definirPesquisa(page);
   

    await page.getByRole('button', { name: ' Pesquisar' }).click();


    //Pega os links da pagina inical
    
    let linkVagas = [...await pegarLinks(page)]

    //pega o texto da paginação e a quantidade de vagas para descobrir quantas paginas foram retornadas
    const frasePaginacao = await page.getByRole('heading', { name: 'ofertas encontradas' }).textContent()

    //A frase de paginação só inclui este caractere caso existam multiplas paginas

    if(frasePaginacao.includes('-')){
        
        let totalPaginas = frasePaginacao.split('-')[1].split(' ')[4];
        

        let linksPorPagina = await pegaLinksPorPagina(context,chave,categoriaEscolhida,zonaEscolhida, totalPaginas);
        
        if(linksPorPagina.length>=1) {
            linkVagas.push(...linksPorPagina)
        }
    }
    else {
        console.log('Somente uma pagina foi encontrada');
        
    }
    
    //Faz um loop pelas paginas e coleta os links
    
    console.log('Links coletados:', linkVagas);

    console.log('Total de links coletados:', linkVagas.length); 

    //Isto sera feito por vaga...
    await acederVagasEGravarConteudos(context,linkVagas);

    await browser.close()

    return;
}

  
run()
