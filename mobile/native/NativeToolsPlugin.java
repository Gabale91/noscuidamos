package br.com.gabale.noscuidamos.teste;
import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.print.PrintManager;
import android.print.PrintAttributes;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.OutputStream;

@CapacitorPlugin(name="NativeTools")
public class NativeToolsPlugin extends Plugin {
  private byte[] pending;
  @PluginMethod public void print(PluginCall call){
    getActivity().runOnUiThread(()->{try{PrintManager manager=(PrintManager)getActivity().getSystemService(Context.PRINT_SERVICE);manager.print("Nós Cuidamos",getBridge().getWebView().createPrintDocumentAdapter("Resumo pós-consultas"),new PrintAttributes.Builder().build());call.resolve();}catch(Exception e){call.reject("Não foi possível abrir a impressão.");}});
  }
  @PluginMethod public synchronized void saveDocument(PluginCall call){
    if(pending!=null){call.reject("Conclua o salvamento anterior.");return;}
    try{
      String encoded=call.getString("base64","");if(encoded.length()>15000000){call.reject("Arquivo muito grande.");return;}
      pending=Base64.decode(encoded,Base64.DEFAULT);
      String mime=call.getString("mime","application/octet-stream");
      if(!mime.equals("application/pdf")&&!mime.equals("image/png")&&!mime.equals("image/jpeg")){pending=null;call.reject("Formato não suportado.");return;}
      Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(mime);intent.putExtra(Intent.EXTRA_TITLE,call.getString("name","documento").replaceAll("[\\\\/\\p{Cntrl}]","_"));startActivityForResult(call,intent,"documentSaved");
    }catch(Exception e){pending=null;call.reject("Não foi possível abrir o seletor de arquivos.");}
  }
  @ActivityCallback private void documentSaved(PluginCall call,ActivityResult result){
    try{if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.reject("Salvamento cancelado.");return;}if(pending==null){call.reject("Tente salvar novamente.");return;}
      try(OutputStream out=getContext().getContentResolver().openOutputStream(result.getData().getData())){if(out==null)throw new Exception();out.write(pending);}call.resolve();
    }catch(Exception e){if(call!=null)call.reject("Não foi possível salvar o documento.");}finally{pending=null;}
  }
}
